<?php
/**
 * Plugin Name: Life Wheel
 * Description: Interactive life wheel assessment where students rate 8 life categories with AI-powered analysis and insights. Use shortcode [life_wheel].
 * Version: 1.0.2
 * Author: MisterT9007
 */

if ( ! defined( 'ABSPATH' ) ) exit;

class Life_Wheel {
    const VERSION      = '1.0.0';
    const TABLE        = 'mfsd_life_wheel_results';
    const NONCE_ACTION = 'wp_rest';

    private $categories = array(
        'School life',
        'Finances',
        'Health',
        'Family and Friends',
        'Romance',
        'Personal Growth',
        'Fun and Recreation',
        'Physical Environment'
    );

    public function __construct() {
        register_activation_hook( __FILE__, array( $this, 'on_activate' ) );
        add_action( 'init', array( $this, 'register_assets' ) );
        add_shortcode( 'life_wheel', array( $this, 'shortcode' ) );
        add_action( 'rest_api_init', array( $this, 'register_routes' ) );
        
        // Force flush rewrite rules on version change
        add_action( 'plugins_loaded', array( $this, 'check_version' ) );
    }

    public function check_version() {
        $saved_version = get_option( 'life_wheel_version' );
        if ( $saved_version !== self::VERSION ) {
            flush_rewrite_rules();
            update_option( 'life_wheel_version', self::VERSION );
            error_log( 'Life Wheel: Flushed rewrite rules for version ' . self::VERSION );
        }
    }

    public function on_activate() {
        global $wpdb;
        $table = $wpdb->prefix . self::TABLE;
        $charset = $wpdb->get_charset_collate();

        $sql = "CREATE TABLE IF NOT EXISTS $table (
            id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
            user_id BIGINT UNSIGNED NOT NULL,
            ratings_json LONGTEXT NULL,
            category_summaries_json LONGTEXT NULL,
            overall_summary LONGTEXT NULL,
            status VARCHAR(20) DEFAULT 'not_started',
            current_category INT DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            KEY idx_user (user_id),
            KEY idx_status (status),
            UNIQUE KEY idx_user_unique (user_id)
        ) $charset;";

        require_once ABSPATH . 'wp-admin/includes/upgrade.php';
        dbDelta($sql);
        
        // Force flush on activation
        flush_rewrite_rules();
    }

    public function register_assets() {
        $handle = 'life-wheel';
        
        // Try multiple methods to get the correct URL
        $plugin_url = plugin_dir_url( __FILE__ );
        
        // Alternative: use plugins_url with the folder name
        $alt_url = plugins_url( '', __FILE__ );
        
        // Construct full URLs
        $js_url = $plugin_url . 'assets/life-wheel.js';
        $css_url = $plugin_url . 'assets/life-wheel.css';
        
        // Log for debugging
        error_log( '=== Life Wheel Asset Registration ===' );
        error_log( 'Plugin File (__FILE__): ' . __FILE__ );
        error_log( 'plugin_dir_url: ' . $plugin_url );
        error_log( 'plugins_url: ' . $alt_url );
        error_log( 'JS URL: ' . $js_url );
        error_log( 'CSS URL: ' . $css_url );
        
        // Check if files exist on filesystem
        $js_path = plugin_dir_path( __FILE__ ) . 'assets/life-wheel.js';
        $css_path = plugin_dir_path( __FILE__ ) . 'assets/life-wheel.css';
        error_log( 'Plugin Dir Path: ' . plugin_dir_path( __FILE__ ) );
        error_log( 'JS file exists: ' . ( file_exists( $js_path ) ? 'YES' : 'NO' ) . ' (' . $js_path . ')' );
        error_log( 'CSS file exists: ' . ( file_exists( $css_path ) ? 'YES' : 'NO' ) . ' (' . $css_path . ')' );
        
        // Check assets folder
        $assets_dir = plugin_dir_path( __FILE__ ) . 'assets';
        if ( is_dir( $assets_dir ) ) {
            error_log( 'Assets folder exists: YES' );
            $files = scandir( $assets_dir );
            error_log( 'Files in assets folder: ' . implode( ', ', $files ) );
        } else {
            error_log( 'Assets folder exists: NO - Expected at: ' . $assets_dir );
        }
        error_log( '=====================================' );
        
        wp_register_script(
            $handle,
            $js_url,
            array(),
            self::VERSION,
            true
        );
        wp_register_style(
            $handle,
            $css_url,
            array(),
            self::VERSION
        );
    }

    public function shortcode( $atts, $content = null ) {
        $handle = 'life-wheel';
        wp_enqueue_script( $handle );
        wp_enqueue_style( $handle );

        $chat_html = '';
        if ( shortcode_exists( 'mwai_chatbot' ) ) {
            $chat_html = do_shortcode( '[mwai_chatbot id="chatbot-vxk8pu"]' );
        }

        $user_id = $this->get_current_user_id();
        $display_name = '';
        if ( $user_id && function_exists( 'um_get_display_name' ) ) {
            $display_name = um_get_display_name( $user_id );
        } elseif ( $user_id ) {
            $user = get_userdata( $user_id );
            if ( $user ) {
                $display_name = $user->display_name;
            }
        }

        $config = array(
            'restUrlSubmit' => esc_url_raw( rest_url( 'life-wheel/v1/submit' ) ),
            'restUrlStatus' => esc_url_raw( rest_url( 'life-wheel/v1/status' ) ),
            'nonce'         => wp_create_nonce( 'wp_rest' ),
            'user'          => is_user_logged_in() ? wp_get_current_user()->user_login : '',
            'email'         => is_user_logged_in() ? wp_get_current_user()->user_email : '',
            'userId'        => $user_id,
            'displayName'   => $display_name,
            'categories'    => $this->categories,
        );

        wp_add_inline_script(
            $handle,
            'window.LIFE_WHEEL_CFG = ' . wp_json_encode( $config ) . ';',
            'before'
        );

        $out  = '<div id="life-wheel-root"></div>';
        $out .= '<div id="life-wheel-chat-source" style="display:none;">'
             .  $chat_html
             .  '</div>';

        return $out;
    }

    public function register_routes() {
        error_log( 'Life Wheel: Registering REST routes' );
        
        register_rest_route( 'life-wheel/v1', '/submit', array(
            'methods'             => 'POST',
            'callback'            => array( $this, 'handle_submit' ),
            'permission_callback' => array( $this, 'check_permission' ),
        ) );

        register_rest_route( 'life-wheel/v1', '/status', array(
            'methods'             => 'GET',
            'callback'            => array( $this, 'handle_status' ),
            'permission_callback' => array( $this, 'check_permission' ),
        ) );
    }

    public function check_permission( WP_REST_Request $request ) {
        if ( ! is_user_logged_in() ) {
            return new WP_Error( 'unauthorized', 'You must be logged in', array( 'status' => 401 ) );
        }
        return true;
    }

    public function handle_status( WP_REST_Request $req ) {
        global $wpdb;
        $user_id = $this->get_current_user_id();

        error_log( 'Life Wheel Status: user_id=' . $user_id );

        if ( ! $user_id ) {
            return new WP_REST_Response( array(
                'ok' => true,
                'status' => 'not_started'
            ), 200 );
        }

        $table = $wpdb->prefix . self::TABLE;

        $saved = $wpdb->get_row( $wpdb->prepare(
            "SELECT * FROM $table WHERE user_id = %d LIMIT 1",
            $user_id
        ), ARRAY_A );

        error_log( 'Life Wheel Status: DB result=' . print_r( $saved, true ) );

        if ( ! $saved ) {
            return new WP_REST_Response( array(
                'ok' => true,
                'status' => 'not_started'
            ), 200 );
        }

        $ratings = json_decode( $saved['ratings_json'], true );
        $category_summaries = json_decode( $saved['category_summaries_json'], true );
        $status = $saved['status'];
        $overall_summary = $saved['overall_summary'];
        $current_category = (int) $saved['current_category'];

        if ( $status === 'completed' && $overall_summary ) {
            return new WP_REST_Response( array(
                'ok' => true,
                'status' => 'completed',
                'ratings' => $ratings ?: array(),
                'category_summaries' => $category_summaries ?: array(),
                'overall_summary' => $overall_summary
            ), 200 );
        } elseif ( $status === 'in_progress' ) {
            return new WP_REST_Response( array(
                'ok' => true,
                'status' => 'in_progress',
                'ratings' => $ratings ?: array(),
                'category_summaries' => $category_summaries ?: array(),
                'current_category' => $current_category
            ), 200 );
        }

        return new WP_REST_Response( array(
            'ok' => true,
            'status' => 'not_started'
        ), 200 );
    }

    public function handle_submit( WP_REST_Request $req ) {
        try {
            global $wpdb;
            $user_id = $this->get_current_user_id();

            error_log( 'Life Wheel Submit: user_id=' . $user_id );

            if ( ! $user_id ) {
                return new WP_REST_Response( array(
                    'ok' => false,
                    'error' => 'User not logged in'
                ), 401 );
            }

            $table = $wpdb->prefix . self::TABLE;
            $step = $req->get_param( 'step' );

            if ( $step === 'save_rating' ) {
                $category_index = (int) $req->get_param( 'category_index' );
                $rating = (int) $req->get_param( 'rating' );
                $category_name = $this->categories[$category_index] ?? '';

                if ( ! $category_name || $rating < 0 || $rating > 10 ) {
                    return new WP_REST_Response( array(
                        'ok' => false,
                        'error' => 'Invalid category or rating'
                    ), 400 );
                }

                // Get existing data
                $saved = $wpdb->get_row( $wpdb->prepare(
                    "SELECT * FROM $table WHERE user_id = %d LIMIT 1",
                    $user_id
                ), ARRAY_A );

                $ratings = $saved ? json_decode( $saved['ratings_json'], true ) : array();
                $category_summaries = $saved ? json_decode( $saved['category_summaries_json'], true ) : array();
                
                if ( ! is_array( $ratings ) ) $ratings = array();
                if ( ! is_array( $category_summaries ) ) $category_summaries = array();

                // Save the rating
                $ratings[$category_name] = $rating;

                // Generate AI summary for this category
                $category_summary = '';
                if ( isset( $GLOBALS['mwai'] ) ) {
                    try {
                        $mwai = $GLOBALS['mwai'];
                        $display_name = '';
                        if ( function_exists( 'um_get_display_name' ) ) {
                            $display_name = um_get_display_name( $user_id );
                        } else {
                            $user = get_userdata( $user_id );
                            if ( $user ) {
                                $display_name = $user->display_name;
                            }
                        }

                        $prompt = $this->get_category_summary_prompt( $category_name, $rating, $display_name );
                        $category_summary = $mwai->simpleTextQuery( $prompt );
                        $category_summaries[$category_name] = $category_summary;

                    } catch ( Exception $e ) {
                        error_log( 'Life Wheel category summary failed: ' . $e->getMessage() );
                        $category_summary = '';
                    }
                }

                // Determine next category and status
                $next_category = $category_index + 1;
                $is_complete = $next_category >= count( $this->categories );
                $new_status = $is_complete ? 'ratings_complete' : 'in_progress';

                // Save to database
                $data = array(
                    'user_id' => $user_id,
                    'ratings_json' => wp_json_encode( $ratings ),
                    'category_summaries_json' => wp_json_encode( $category_summaries ),
                    'status' => $new_status,
                    'current_category' => $next_category
                );
                
                $format = array( '%d', '%s', '%s', '%s', '%d' );
                
                $result = $wpdb->replace( $table, $data, $format );

                error_log( 'Life Wheel: save_rating result=' . $result . ', error=' . $wpdb->last_error );

                if ( $result === false ) {
                    error_log( 'Life Wheel DB Error (save_rating): ' . $wpdb->last_error );
                    return new WP_REST_Response( array(
                        'ok' => false,
                        'error' => 'Database error: ' . $wpdb->last_error
                    ), 500 );
                }

                return new WP_REST_Response( array(
                    'ok' => true,
                    'status' => $new_status,
                    'category_summary' => $category_summary,
                    'next_category' => $next_category,
                    'is_complete' => $is_complete
                ), 200 );
            }
            elseif ( $step === 'generate_overall_summary' ) {
                // Get saved data
                $saved = $wpdb->get_row( $wpdb->prepare(
                    "SELECT * FROM $table WHERE user_id = %d LIMIT 1",
                    $user_id
                ), ARRAY_A );

                if ( ! $saved ) {
                    return new WP_REST_Response( array(
                        'ok' => false,
                        'error' => 'No data found'
                    ), 404 );
                }

                $ratings = json_decode( $saved['ratings_json'], true );
                $category_summaries = json_decode( $saved['category_summaries_json'], true );

                // Generate overall AI summary
                $overall_summary = '';
                if ( isset( $GLOBALS['mwai'] ) && ! empty( $ratings ) ) {
                    try {
                        $mwai = $GLOBALS['mwai'];
                        $display_name = '';
                        if ( function_exists( 'um_get_display_name' ) ) {
                            $display_name = um_get_display_name( $user_id );
                        } else {
                            $user = get_userdata( $user_id );
                            if ( $user ) {
                                $display_name = $user->display_name;
                            }
                        }

                        $prompt = $this->get_overall_summary_prompt( $ratings, $display_name );
                        $overall_summary = $mwai->simpleTextQuery( $prompt );

                    } catch ( Exception $e ) {
                        error_log( 'Life Wheel overall summary failed: ' . $e->getMessage() );
                        $overall_summary = '';
                    }
                }

                // Update database with completed status
                $data = array(
                    'overall_summary' => $overall_summary,
                    'status' => 'completed'
                );
                
                $wpdb->update(
                    $table,
                    $data,
                    array( 'user_id' => $user_id ),
                    array( '%s', '%s' ),
                    array( '%d' )
                );

                return new WP_REST_Response( array(
                    'ok' => true,
                    'overall_summary' => $overall_summary,
                    'status' => 'completed'
                ), 200 );
            }
            elseif ( $step === 'reset' ) {
                // Reset to start over
                $wpdb->delete( $table, array( 'user_id' => $user_id ), array( '%d' ) );

                return new WP_REST_Response( array(
                    'ok' => true,
                    'status' => 'not_started'
                ), 200 );
            }

            return new WP_REST_Response( array(
                'ok' => false,
                'error' => 'Invalid step: ' . $step
            ), 400 );

        } catch ( Exception $e ) {
            error_log( 'Life Wheel Submit Error: ' . $e->getMessage() );
            return new WP_REST_Response( array(
                'ok' => false,
                'error' => 'Server error: ' . $e->getMessage()
            ), 500 );
        }
    }

    private function get_category_summary_prompt( $category, $rating, $display_name ) {
        $name_str = $display_name ? $display_name : 'the student';
        
        $prompt = <<<PROMPT
You are a friendly, supportive life coach for young people aged 12-14.

The student has just rated their "$category" at $rating out of 10.

Please provide a brief, encouraging 2-3 sentence reflection on this rating that:
1. Acknowledges where they are right now without judgment
2. Offers a positive perspective or insight
3. If the rating is lower (below 5), gently suggests hope for improvement
4. If the rating is higher (7+), celebrates their strength in this area

Use warm, age-appropriate language. Be genuine, not overly cheerful. Keep it conversational and supportive.
PROMPT;

        return $prompt;
    }

    private function get_overall_summary_prompt( $ratings, $display_name ) {
        $name_str = $display_name ? $display_name : 'the student';
        
        $prompt = <<<'PROMPT'
You are a friendly, supportive life coach for young people aged 12-14.

Your job is to help them understand their Life Wheel results and identify patterns that can help them grow.

CORE TEACHING ROLE:
Act as a warm, supportive guide who:
• Helps students understand themselves
• Encourages curiosity and self-reflection
• Builds confidence
• Keeps things practical and achievable
• Motivates without pressure
• Uses language a 12–14-year-old naturally understands

SOLUTIONS MINDSET (Steve Solutions Principles):
Naturally weave these beliefs into your feedback:
• "What is the solution to every problem I face?"
• "If you have a solutions mindset, marginal gains will occur."
• "There is no failure, only feedback."
• "A smooth sea never made a skilled sailor."
• "If one person can do it, anyone can do it."
• "Happiness is a journey, not an outcome."
• "You never lose — you either win or learn."
• "Character over calibre."
• "The person with the most passion has the greatest impact."
• "Hard work beats talent when talent doesn't work hard."

TONE REQUIREMENTS:
• Speak warmly, clearly, and encouragingly
• Use age-appropriate words for 12–14-year-olds
• Be positive, empathetic, and supportive
• Avoid judgment or harsh criticism
• Turn challenges into growth opportunities
• Keep responses practical, motivational, and simple
• Encourage reflection and action
• Celebrate strengths and acknowledge areas for growth

PROMPT;

        $prompt .= "\n\nHere are the student's Life Wheel ratings:\n\n";
        
        foreach ( $ratings as $category => $rating ) {
            $prompt .= "• $category: $rating/10\n";
        }

        $prompt .= "\n\nPlease provide an encouraging and insightful overall summary that includes:\n\n";
        $prompt .= "1. Their strongest areas (highest ratings) and what this suggests about their current life balance\n";
        $prompt .= "2. Areas that might benefit from attention (lower ratings) - frame these as opportunities, not problems\n";
        $prompt .= "3. Any patterns you notice (e.g., high in relationships but lower in self-care, or vice versa)\n";
        $prompt .= "4. One specific, practical suggestion they could try this week to improve their lowest-rated area\n";
        $prompt .= "5. A motivational message reminding them that life balance is a journey, and every small step counts\n\n";
        $prompt .= "Keep the tone warm, personal, and empowering. Use UK spelling. Make it feel like a caring mentor is speaking directly to them.";

        return $prompt;
    }

    private function get_current_user_id() {
        if ( function_exists( 'um_profile_id' ) ) {
            $pid = um_profile_id();
            if ( $pid ) return (int) $pid;
        }
        return (int) get_current_user_id();
    }
}

new Life_Wheel();