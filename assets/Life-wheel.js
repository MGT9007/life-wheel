(function () {
  const cfg = window.LIFE_WHEEL_CFG || {};
  const root = document.getElementById("life-wheel-root");
  if (!root) return;

  console.log('Life Wheel Config:', cfg);

  const chatSource = document.getElementById("life-wheel-chat-source");
  const categories = cfg.categories || [];

  let ratings = {};
  let categorySummaries = {};
  let overallSummary = '';
  let currentCategory = 0;
  let step = "loading";

  function el(tag, cls, txt) {
    const x = document.createElement(tag);
    if (cls) x.className = cls;
    if (txt !== undefined && txt !== null) x.textContent = txt;
    return x;
  }

  function showLoadingOverlay(message = "Loading...") {
    const overlay = el("div", "lw-loading-overlay");
    const spinner = el("div", "lw-spinner");
    const text = el("div", "lw-loading-text", message);
    
    overlay.appendChild(spinner);
    overlay.appendChild(text);
    document.body.appendChild(overlay);
    
    return overlay;
  }

  function hideLoadingOverlay(overlay) {
    if (overlay && overlay.parentNode) {
      overlay.parentNode.removeChild(overlay);
    }
  }

  async function checkStatus() {
    try {
      console.log('Checking status at:', cfg.restUrlStatus);
      
      const res = await fetch(cfg.restUrlStatus + "?_=" + Date.now(), {
        method: 'GET',
        headers: {
          'X-WP-Nonce': cfg.nonce || '',
          'Accept': 'application/json'
        },
        credentials: 'same-origin'
      });

      console.log('Status response:', res.status, res.statusText);

      if (res.ok) {
        const data = await res.json();
        console.log('Life Wheel Status:', data);
        
        if (data.ok && data.status === 'completed' && data.overall_summary) {
          ratings = data.ratings || {};
          categorySummaries = data.category_summaries || {};
          overallSummary = data.overall_summary;
          step = "summary";
        } else if (data.ok && data.status === 'in_progress') {
          ratings = data.ratings || {};
          categorySummaries = data.category_summaries || {};
          currentCategory = data.current_category || 0;
          step = "rating";
        } else {
          step = "intro";
        }
      } else {
        const errorText = await res.text();
        console.error('Status check failed:', res.status, errorText);
        step = "intro";
      }
    } catch (err) {
      console.error('Status check error:', err);
      step = "intro";
    }

    mount();
  }

  async function submitRating(categoryIndex, rating) {
    try {
      const overlay = showLoadingOverlay("Saving your rating...");
      
      const res = await fetch(cfg.restUrlSubmit, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-WP-Nonce': cfg.nonce || ''
        },
        credentials: 'same-origin',
        body: JSON.stringify({
          step: 'save_rating',
          category_index: categoryIndex,
          rating: rating
        })
      });

      const data = await res.json();
      hideLoadingOverlay(overlay);

      if (data.ok) {
        ratings[categories[categoryIndex]] = rating;
        if (data.category_summary) {
          categorySummaries[categories[categoryIndex]] = data.category_summary;
        }
        
        if (data.is_complete) {
          // All ratings done, generate overall summary
          await generateOverallSummary();
        } else {
          currentCategory = data.next_category;
          step = "rating";
          mount();
        }
      } else {
        alert('Error saving rating: ' + (data.error || 'Unknown error'));
      }
    } catch (err) {
      console.error('Submit error:', err);
      alert('Error saving rating. Please try again.');
    }
  }

  async function generateOverallSummary() {
    try {
      const overlay = showLoadingOverlay("Generating your Life Wheel summary...");
      
      const res = await fetch(cfg.restUrlSubmit, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-WP-Nonce': cfg.nonce || ''
        },
        credentials: 'same-origin',
        body: JSON.stringify({
          step: 'generate_overall_summary'
        })
      });

      const data = await res.json();
      hideLoadingOverlay(overlay);

      if (data.ok) {
        overallSummary = data.overall_summary || '';
        step = "summary";
        mount();
      } else {
        alert('Error generating summary: ' + (data.error || 'Unknown error'));
      }
    } catch (err) {
      console.error('Generate summary error:', err);
      alert('Error generating summary. Please try again.');
    }
  }

  async function resetWheel() {
    if (!confirm('Are you sure you want to start over? This will delete your current wheel.')) {
      return;
    }

    try {
      const overlay = showLoadingOverlay("Resetting...");
      
      const res = await fetch(cfg.restUrlSubmit, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-WP-Nonce': cfg.nonce || ''
        },
        credentials: 'same-origin',
        body: JSON.stringify({
          step: 'reset'
        })
      });

      const data = await res.json();
      hideLoadingOverlay(overlay);

      if (data.ok) {
        ratings = {};
        categorySummaries = {};
        overallSummary = '';
        currentCategory = 0;
        step = "intro";
        mount();
      } else {
        alert('Error resetting: ' + (data.error || 'Unknown error'));
      }
    } catch (err) {
      console.error('Reset error:', err);
      alert('Error resetting. Please try again.');
    }
  }

  function renderIntro() {
    const wrap = el("div", "lw-wrap");
    const card = el("div", "lw-card");

    const head = el("div", "lw-header");
    head.appendChild(el("h2", "lw-title", "Welcome to Your Life Wheel"));
    card.appendChild(head);

    const intro = el("div", "lw-intro");
    
    const p1 = el("p");
    p1.innerHTML = "<strong>Where are you at? Life wheel – Grade yourself on the below 8 measurements. 1-10</strong>";
    intro.appendChild(p1);
    
    const p2 = el("p");
    p2.textContent = "Your Life Wheel helps you see how balanced your life feels right now. You'll rate 8 different areas from 0-10, and we'll create a visual wheel that shows your current life balance.";
    intro.appendChild(p2);

    card.appendChild(intro);

    // Show the wheel image
    const wheelContainer = el("div", "lw-wheel-preview");
    const wheelCanvas = document.createElement("canvas");
    wheelCanvas.id = "lw-wheel-preview-canvas";
    wheelCanvas.width = 400;
    wheelCanvas.height = 400;
    wheelContainer.appendChild(wheelCanvas);
    card.appendChild(wheelContainer);

    // Draw the empty wheel
    drawWheel(wheelCanvas, {}, true);

    const startContainer = el("div", "lw-start-container");
    const startBtn = el("button", "lw-btn lw-btn-start", "Start");
    startBtn.onclick = () => {
      step = "rating";
      currentCategory = 0;
      mount();
    };
    startContainer.appendChild(startBtn);
    card.appendChild(startContainer);

    wrap.appendChild(card);
    return wrap;
  }

  function renderRating() {
    const wrap = el("div", "lw-wrap");
    const card = el("div", "lw-card");

    const head = el("div", "lw-header");
    const title = el("h2", "lw-title", `Rate: ${categories[currentCategory]}`);
    const progress = el("span", "lw-progress", `${currentCategory + 1} of ${categories.length}`);
    head.appendChild(title);
    head.appendChild(progress);
    card.appendChild(head);

    // Wheel container with spinning animation
    const wheelContainer = el("div", "lw-wheel-container");
    const wheelCanvas = document.createElement("canvas");
    wheelCanvas.id = "lw-wheel-canvas";
    wheelCanvas.width = 400;
    wheelCanvas.height = 400;
    wheelContainer.appendChild(wheelCanvas);

    // Initially show wheel spinning
    wheelContainer.classList.add("lw-spinning");
    card.appendChild(wheelContainer);

    // Category summary if available
    if (categorySummaries[categories[currentCategory - 1]]) {
      const summaryCard = el("div", "lw-summary-card");
      const summaryTitle = el("h3", "lw-summary-title", "Your Reflection");
      const summaryText = el("p", "lw-summary-text", categorySummaries[categories[currentCategory - 1]]);
      summaryCard.appendChild(summaryTitle);
      summaryCard.appendChild(summaryText);
      card.appendChild(summaryCard);
    }

    // Slider container (initially hidden)
    const sliderContainer = el("div", "lw-slider-container");
    sliderContainer.style.display = "none";

    const sliderLabel = el("label", "lw-slider-label", "How would you rate this area of your life?");
    sliderLabel.htmlFor = "lw-slider";
    sliderContainer.appendChild(sliderLabel);

    const sliderWrapper = el("div", "lw-slider-wrapper");
    
    const slider = document.createElement("input");
    slider.type = "range";
    slider.id = "lw-slider";
    slider.className = "lw-slider";
    slider.min = "0";
    slider.max = "10";
    slider.value = ratings[categories[currentCategory]] || "5";
    
    const sliderValue = el("div", "lw-slider-value", slider.value);
    
    slider.oninput = () => {
      sliderValue.textContent = slider.value;
    };

    sliderWrapper.appendChild(slider);
    sliderWrapper.appendChild(sliderValue);
    sliderContainer.appendChild(sliderWrapper);

    const sliderScale = el("div", "lw-slider-scale");
    sliderScale.innerHTML = '<span>0</span><span>1</span><span>2</span><span>3</span><span>4</span><span>5</span><span>6</span><span>7</span><span>8</span><span>9</span><span>10</span>';
    sliderContainer.appendChild(sliderScale);

    card.appendChild(sliderContainer);

    // Confirm button (initially hidden)
    const actions = el("div", "lw-actions");
    actions.style.display = "none";
    
    const confirmBtn = el("button", "lw-btn", "Confirm");
    confirmBtn.onclick = async () => {
      const rating = parseInt(slider.value);
      await submitRating(currentCategory, rating);
    };
    
    actions.appendChild(confirmBtn);
    card.appendChild(actions);

    wrap.appendChild(card);

    // Animate the wheel spinning and stopping
    setTimeout(() => {
      animateWheelSpin(wheelCanvas, currentCategory, () => {
        wheelContainer.classList.remove("lw-spinning");
        sliderContainer.style.display = "block";
        actions.style.display = "flex";
        
        // Draw the wheel with current ratings and highlight current category
        drawWheelWithRatings(wheelCanvas, ratings, currentCategory, parseInt(slider.value));
        
        // Update wheel as slider moves
        slider.oninput = () => {
          sliderValue.textContent = slider.value;
          drawWheelWithRatings(wheelCanvas, ratings, currentCategory, parseInt(slider.value));
        };
      });
    }, 100);

    return wrap;
  }

  function renderSummary() {
    const wrap = el("div", "lw-wrap");
    const card = el("div", "lw-card");

    const head = el("div", "lw-header");
    head.appendChild(el("h2", "lw-title", "Your Life Wheel Summary"));
    card.appendChild(head);

    // Wheel visualization
    const wheelContainer = el("div", "lw-wheel-container");
    const wheelTitle = el("h3", "lw-wheel-title", "Your Life Balance");
    wheelContainer.appendChild(wheelTitle);
    
    const wheelCanvas = document.createElement("canvas");
    wheelCanvas.id = "lw-wheel-final-canvas";
    wheelCanvas.width = 400;
    wheelCanvas.height = 400;
    wheelContainer.appendChild(wheelCanvas);
    card.appendChild(wheelContainer);

    // Draw the completed wheel
    drawWheel(wheelCanvas, ratings, false);

    // Overall AI analysis
    if (overallSummary) {
      const analysisCard = el("div", "lw-analysis-card");
      const analysisTitle = el("h3", "lw-analysis-title", "Your Personal Insights");
      const analysisText = el("div", "lw-analysis-text");
      analysisText.textContent = overallSummary;
      analysisCard.appendChild(analysisTitle);
      analysisCard.appendChild(analysisText);
      card.appendChild(analysisCard);
    }

    // Chatbot section
    if (chatSource && chatSource.innerHTML.trim()) {
      const chatCard = el("div", "lw-chat-card");
      const chatTitle = el("h3", "lw-chat-title", "Have Questions?");
      const chatSub = el("p", "lw-chat-sub", "Chat with our AI coach about your Life Wheel results.");
      chatCard.appendChild(chatTitle);
      chatCard.appendChild(chatSub);
      
      const chatWrap = el("div", "lw-chatwrap");
      chatWrap.innerHTML = chatSource.innerHTML;
      chatCard.appendChild(chatWrap);
      
      card.appendChild(chatCard);
    }

    // Actions
    const actions = el("div", "lw-actions");
    const resetBtn = el("button", "lw-btn lw-btn-secondary", "Start Over");
    resetBtn.onclick = resetWheel;
    actions.appendChild(resetBtn);
    card.appendChild(actions);

    wrap.appendChild(card);
    return wrap;
  }

  function animateWheelSpin(canvas, targetCategory, callback) {
    const ctx = canvas.getContext('2d');
    let rotation = 0;
    const totalSpins = 2; // Spin 2 full rotations
    const targetAngle = (targetCategory * (360 / categories.length)) * (Math.PI / 180);
    const totalRotation = (totalSpins * 360 + (targetCategory * (360 / categories.length))) * (Math.PI / 180);
    const duration = 2000; // 2 seconds
    const startTime = Date.now();

    function animate() {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      
      // Easing function (ease-out)
      const eased = 1 - Math.pow(1 - progress, 3);
      rotation = totalRotation * eased;

      // Clear and redraw
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.save();
      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.rotate(rotation);
      ctx.translate(-canvas.width / 2, -canvas.height / 2);
      
      drawWheelStatic(canvas, {}, false, false);
      
      ctx.restore();

      if (progress < 1) {
        requestAnimationFrame(animate);
      } else {
        callback();
      }
    }

    animate();
  }

  function drawWheelStatic(canvas, ratingsData, isEmpty, noRotation = true) {
    const ctx = canvas.getContext('2d');
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    const radius = Math.min(centerX, centerY) - 60;
    const numCategories = categories.length;

    if (noRotation) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }

    // Draw segments
    for (let i = 0; i < numCategories; i++) {
      const startAngle = (i * 2 * Math.PI / numCategories) - Math.PI / 2;
      const endAngle = ((i + 1) * 2 * Math.PI / numCategories) - Math.PI / 2;
      
      const category = categories[i];
      const rating = ratingsData[category] || 0;
      const fillRadius = isEmpty ? 0 : (rating / 10) * radius;

      // Draw filled segment
      ctx.beginPath();
      ctx.moveTo(centerX, centerY);
      ctx.arc(centerX, centerY, fillRadius, startAngle, endAngle);
      ctx.closePath();
      
      const hue = (i * 360 / numCategories);
      ctx.fillStyle = `hsl(${hue}, 70%, 60%)`;
      ctx.fill();

      // Draw segment border
      ctx.beginPath();
      ctx.moveTo(centerX, centerY);
      ctx.arc(centerX, centerY, radius, startAngle, endAngle);
      ctx.closePath();
      ctx.strokeStyle = '#333';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Draw category label
      const labelAngle = (startAngle + endAngle) / 2;
      const labelRadius = radius + 30;
      const labelX = centerX + Math.cos(labelAngle) * labelRadius;
      const labelY = centerY + Math.sin(labelAngle) * labelRadius;

      ctx.save();
      ctx.translate(labelX, labelY);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = '12px Arial';
      ctx.fillStyle = '#333';
      
      // Wrap long category names
      const words = category.split(' ');
      if (words.length > 2) {
        ctx.fillText(words.slice(0, 2).join(' '), 0, -6);
        ctx.fillText(words.slice(2).join(' '), 0, 6);
      } else {
        ctx.fillText(category, 0, 0);
      }
      
      ctx.restore();
    }

    // Draw center circle
    ctx.beginPath();
    ctx.arc(centerX, centerY, 5, 0, 2 * Math.PI);
    ctx.fillStyle = '#333';
    ctx.fill();

    // Draw scale rings
    for (let i = 1; i <= 10; i++) {
      ctx.beginPath();
      ctx.arc(centerX, centerY, (i / 10) * radius, 0, 2 * Math.PI);
      ctx.strokeStyle = i % 2 === 0 ? '#ddd' : '#eee';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }

  function drawWheel(canvas, ratingsData, isEmpty) {
    drawWheelStatic(canvas, ratingsData, isEmpty, true);
  }

  function drawWheelWithRatings(canvas, ratingsData, highlightCategory, currentRating) {
    const ctx = canvas.getContext('2d');
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    const radius = Math.min(centerX, centerY) - 60;
    const numCategories = categories.length;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw segments
    for (let i = 0; i < numCategories; i++) {
      const startAngle = (i * 2 * Math.PI / numCategories) - Math.PI / 2;
      const endAngle = ((i + 1) * 2 * Math.PI / numCategories) - Math.PI / 2;
      
      const category = categories[i];
      let rating = ratingsData[category] || 0;
      
      // If this is the current category being rated, use the slider value
      if (i === highlightCategory) {
        rating = currentRating;
      }
      
      const fillRadius = (rating / 10) * radius;

      // Draw filled segment
      ctx.beginPath();
      ctx.moveTo(centerX, centerY);
      ctx.arc(centerX, centerY, fillRadius, startAngle, endAngle);
      ctx.closePath();
      
      const hue = (i * 360 / numCategories);
      const isHighlighted = i === highlightCategory;
      ctx.fillStyle = isHighlighted ? `hsl(${hue}, 90%, 50%)` : `hsl(${hue}, 70%, 60%)`;
      ctx.fill();

      // Draw segment border
      ctx.beginPath();
      ctx.moveTo(centerX, centerY);
      ctx.arc(centerX, centerY, radius, startAngle, endAngle);
      ctx.closePath();
      ctx.strokeStyle = isHighlighted ? '#000' : '#333';
      ctx.lineWidth = isHighlighted ? 3 : 2;
      ctx.stroke();

      // Draw category label
      const labelAngle = (startAngle + endAngle) / 2;
      const labelRadius = radius + 30;
      const labelX = centerX + Math.cos(labelAngle) * labelRadius;
      const labelY = centerY + Math.sin(labelAngle) * labelRadius;

      ctx.save();
      ctx.translate(labelX, labelY);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = isHighlighted ? 'bold 13px Arial' : '12px Arial';
      ctx.fillStyle = isHighlighted ? '#000' : '#333';
      
      // Wrap long category names
      const words = category.split(' ');
      if (words.length > 2) {
        ctx.fillText(words.slice(0, 2).join(' '), 0, -6);
        ctx.fillText(words.slice(2).join(' '), 0, 6);
      } else {
        ctx.fillText(category, 0, 0);
      }
      
      ctx.restore();
    }

    // Draw center circle
    ctx.beginPath();
    ctx.arc(centerX, centerY, 5, 0, 2 * Math.PI);
    ctx.fillStyle = '#333';
    ctx.fill();

    // Draw scale rings
    for (let i = 1; i <= 10; i++) {
      ctx.beginPath();
      ctx.arc(centerX, centerY, (i / 10) * radius, 0, 2 * Math.PI);
      ctx.strokeStyle = i % 2 === 0 ? '#ddd' : '#eee';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }

  function mount() {
    root.innerHTML = "";
    
    let view;
    if (step === "intro") {
      view = renderIntro();
    } else if (step === "rating") {
      view = renderRating();
    } else if (step === "summary") {
      view = renderSummary();
    } else {
      view = el("div", "lw-wrap", "Loading...");
    }
    
    root.appendChild(view);
  }

  // Initialize
  checkStatus();
})();