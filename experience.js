(function () {
  "use strict";

  var root = document.documentElement;
  var preference = window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;
  var pointerPreference = window.matchMedia ? window.matchMedia("(hover: hover) and (pointer: fine)") : null;
  var paused = !!(preference && preference.matches);
  var control = document.getElementById("motionToggle");
  var videos = document.querySelectorAll("video.feature__bg");
  var surfaces = document.querySelectorAll(".card__surface");
  var progress = document.getElementById("scrollProgress");
  var chapterLinks = document.querySelectorAll(".chapter-nav a");
  var chapters = [];
  var currentChapter = null;
  var wide = innerWidth > 820;
  var animationContext = null;
  var heroCamera = null;
  var lenis = null;
  var lenisTick = null;
  var videoObserver = null;
  var scrollFrame = null;
  var tiltFrame = null;
  var tiltTarget = null;
  var tiltPoint = null;
  var canvas = document.getElementById("sparks");
  var context = null;
  var width = 0;
  var height = 0;
  var particles = [];
  var particleFrame = null;
  var colors = ["#FF2EA6", "#FFB300", "#2FC4F5", "#9D3BE8", "#3FD17F"];

  try { if (canvas) context = canvas.getContext("2d"); } catch (error) {}

  function listenToPreference(query, callback) {
    if (!query) return;
    if (query.addEventListener) query.addEventListener("change", callback);
    else if (query.addListener) query.addListener(callback);
  }

  function makeParticle() {
    return {
      x: Math.random() * width, y: Math.random() * height,
      radius: Math.random() * 2.4 + .5, speed: Math.random() * .4 + .1,
      opacity: Math.random() * .5 + .3, color: colors[(Math.random() * colors.length) | 0]
    };
  }

  function sizeParticles() {
    if (!context) return;
    width = canvas.width = innerWidth;
    height = canvas.height = innerHeight;
    particles = [];
    var count = Math.min(95, Math.round(width / 15));
    for (var i = 0; i < count; i++) particles.push(makeParticle());
  }

  function drawParticles() {
    particleFrame = null;
    if (!context || paused || document.hidden) return;
    context.clearRect(0, 0, width, height);
    for (var i = 0; i < particles.length; i++) {
      var particle = particles[i];
      particle.y -= particle.speed;
      if (particle.y < -5) { particle.y = height + 5; particle.x = Math.random() * width; }
      context.globalAlpha = particle.opacity;
      context.fillStyle = particle.color;
      context.beginPath();
      context.arc(particle.x, particle.y, particle.radius, 0, Math.PI * 2);
      context.fill();
    }
    context.globalAlpha = 1;
    particleFrame = requestAnimationFrame(drawParticles);
  }

  function syncParticles() {
    if (paused || document.hidden) {
      if (particleFrame !== null) cancelAnimationFrame(particleFrame);
      particleFrame = null;
      if (context) context.clearRect(0, 0, width, height);
    } else if (context && particleFrame === null) {
      drawParticles();
    }
  }

  function syncVideos() {
    videos.forEach(function (video) {
      var rect = video.getBoundingClientRect();
      try {
        if (!paused && !document.hidden && rect.bottom > 0 && rect.top < innerHeight) {
          var playing = video.play();
          if (playing && playing.catch) playing.catch(function () {});
        } else {
          video.pause();
        }
      } catch (error) {}
    });
  }

  chapterLinks.forEach(function (link) {
    var href = link.getAttribute("href");
    var target = href && href.charAt(0) === "#" ? document.getElementById(href.slice(1)) : null;
    if (target) chapters.push({ link: link, target: target });
  });

  function updateScrollUI() {
    scrollFrame = null;
    if (document.hidden) return;
    var scrollTop = window.pageYOffset || root.scrollTop || 0;
    var fullHeight = Math.max(root.scrollHeight, document.body ? document.body.scrollHeight : 0);
    var maximum = Math.max(0, fullHeight - innerHeight);
    var fraction = maximum ? Math.max(0, Math.min(1, scrollTop / maximum)) : 0;
    if (progress) progress.style.transform = "scaleX(" + fraction + ")";
    var next = chapters.length ? chapters[0] : null;
    var marker = Math.min(240, innerHeight * .35);
    chapters.forEach(function (chapter) {
      if (chapter.target.getBoundingClientRect().top <= marker) next = chapter;
    });
    if (maximum && scrollTop >= maximum - 2 && chapters.length) next = chapters[chapters.length - 1];
    if (next !== currentChapter) {
      chapterLinks.forEach(function (link) {
        if (next && link === next.link) link.setAttribute("aria-current", "location");
        else link.removeAttribute("aria-current");
      });
      currentChapter = next;
    }
  }

  function requestScrollUpdate() {
    if (!document.hidden && scrollFrame === null) scrollFrame = requestAnimationFrame(updateScrollUI);
  }

  function resetSurface(surface) {
    surface.style.setProperty("--tilt-x", "0deg");
    surface.style.setProperty("--tilt-y", "0deg");
    surface.style.setProperty("--shine-x", "50%");
    surface.style.setProperty("--shine-y", "50%");
  }

  function resetTilt() {
    if (tiltFrame !== null) cancelAnimationFrame(tiltFrame);
    tiltFrame = null;
    tiltTarget = null;
    tiltPoint = null;
    surfaces.forEach(resetSurface);
  }

  function canTilt() {
    return !paused && !document.hidden && !!(pointerPreference && pointerPreference.matches);
  }

  function updateTilt() {
    tiltFrame = null;
    if (!canTilt() || !tiltTarget || !tiltPoint) return;
    var rect = tiltTarget.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    var x = Math.max(0, Math.min(1, (tiltPoint.x - rect.left) / rect.width));
    var y = Math.max(0, Math.min(1, (tiltPoint.y - rect.top) / rect.height));
    tiltTarget.style.setProperty("--tilt-x", ((.5 - y) * 12).toFixed(2) + "deg");
    tiltTarget.style.setProperty("--tilt-y", ((x - .5) * 12).toFixed(2) + "deg");
    tiltTarget.style.setProperty("--shine-x", (x * 100).toFixed(1) + "%");
    tiltTarget.style.setProperty("--shine-y", (y * 100).toFixed(1) + "%");
  }

  // These listeners belong to the page, not an animation context that is rebuilt.
  surfaces.forEach(function (surface) {
    surface.addEventListener("pointermove", function (event) {
      if (!canTilt()) return;
      tiltTarget = surface;
      tiltPoint = { x: event.clientX, y: event.clientY };
      if (tiltFrame === null) tiltFrame = requestAnimationFrame(updateTilt);
    }, { passive: true });
    function leave() {
      resetSurface(surface);
      if (tiltTarget === surface) {
        if (tiltFrame !== null) cancelAnimationFrame(tiltFrame);
        tiltFrame = null;
        tiltTarget = null;
        tiltPoint = null;
      }
    }
    surface.addEventListener("pointerleave", leave);
    surface.addEventListener("pointercancel", leave);
  });

  function clearAnimations() {
    if (lenisTick && window.gsap) window.gsap.ticker.remove(lenisTick);
    lenisTick = null;
    if (lenis) { lenis.destroy(); lenis = null; }
    if (animationContext) {
      var previous = animationContext;
      animationContext = null;
      previous.revert();
    }
    heroCamera = null;
  }

  function showContent() {
    document.querySelectorAll(".reveal,.w").forEach(function (element) {
      element.style.opacity = 1;
      element.style.transform = "none";
    });
  }

  function animate() {
    if (paused || document.hidden || !window.gsap || !window.ScrollTrigger || !window.gsap.context) return;
    try {
      var gsap = window.gsap;
      var ScrollTrigger = window.ScrollTrigger;
      gsap.registerPlugin(ScrollTrigger);
      var statement = document.getElementById("stmt");
      if (statement && !statement.querySelector(".w")) {
        statement.innerHTML = statement.innerHTML.replace(/(<span class="heart">.*?<\/span>)|(\S+)/g, function (match, keep, word) {
          return '<span class="w">' + (keep || word) + '</span> ';
        });
      }
      // Assign before adding effects so partial initialization can always revert.
      animationContext = gsap.context(function () {});
      animationContext.add(function () {
        if (innerWidth > 820) {
          var camera = heroCamera = gsap.timeline({ scrollTrigger: {
            trigger: "#hero", start: "top top", end: "+=120%", scrub: .7, pin: true,
            invalidateOnRefresh: true
          } });
          camera.fromTo(".hero__portrait", { scale: 1.02, yPercent: 0, transformOrigin: "50% 58%" },
            { scale: 1.14, yPercent: -2, duration: 1, ease: "none" }, 0);
          camera.fromTo(".hero__title", { rotationX: 0, z: 0, transformPerspective: 1100, transformOrigin: "50% 50%" },
            { rotationX: 6, yPercent: -15, z: 70, duration: 1, ease: "none" }, 0);
          camera.to(".hero__sub,.hero__actions,.hero .kicker", { y: -18, opacity: 0, duration: .55, ease: "power1.in" }, .45);
          camera.to(".hero__ambient--one", { xPercent: -9, yPercent: -16, z: 30, duration: 1, ease: "none" }, 0);
          camera.to(".hero__ambient--two", { xPercent: 12, yPercent: -10, z: 45, duration: 1, ease: "none" }, 0);
          camera.to(".scrollcue", { autoAlpha: 0, duration: .35, ease: "none" }, .05);
        } else {
          // Keep the photograph and every action readable on phones: no pin or fade.
          gsap.fromTo(".hero__portrait", { scale: 1.02, yPercent: 0 }, {
            scale: 1.035, yPercent: -1.2, ease: "none",
            scrollTrigger: { trigger: "#hero", start: "top top", end: "bottom top", scrub: .6 }
          });
        }
        gsap.fromTo(".statement .w", { opacity: .12 }, { opacity: 1, stagger: .08, ease: "none",
          scrollTrigger: { trigger: "#statement", start: "top 70%", end: "bottom 60%", scrub: true } });
        gsap.utils.toArray(".reveal").forEach(function (element) {
          if (element.classList.contains("card")) return;
          gsap.fromTo(element, { opacity: 0, y: 40 }, { opacity: 1, y: 0, duration: .9, ease: "power3.out",
            scrollTrigger: { trigger: element, start: "top 85%", once: true } });
        });
        gsap.fromTo(".worlds .card", { opacity: 0, y: 64, rotationX: 12, z: -60, transformPerspective: 1100, transformOrigin: "50% 100%" },
          { opacity: 1, y: 0, rotationX: 0, z: 0, stagger: .12, duration: 1, ease: "power3.out",
            scrollTrigger: { trigger: ".grid", start: "top 82%", once: true } });
        gsap.fromTo(".emma__photo img", { yPercent: -8 }, { yPercent: 8, ease: "none",
          scrollTrigger: { trigger: "#emma", start: "top bottom", end: "bottom top", scrub: true } });
        gsap.fromTo(".orb", { scale: .9, rotation: -6, rotationY: -8, transformPerspective: 1000 },
          { scale: 1.05, rotation: 6, rotationY: 8, ease: "none",
            scrollTrigger: { trigger: "#orb", start: "top bottom", end: "bottom top", scrub: true } });
        gsap.to(".feature__bg", { scale: 1.2, yPercent: -2, ease: "none",
          scrollTrigger: { trigger: "#harmony-feature", start: "top bottom", end: "bottom top", scrub: true } });
      });
      if (window.Lenis && innerWidth > 820) {
        lenis = new window.Lenis({ lerp: .1, smoothWheel: true });
        lenis.on("scroll", ScrollTrigger.update);
        lenisTick = function (time) { if (lenis && !document.hidden) lenis.raf(time * 1000); };
        gsap.ticker.add(lenisTick);
      }
      ScrollTrigger.refresh();
      requestScrollUpdate();
    } catch (error) {
      clearAnimations();
      showContent();
    }
  }

  function setMotion(value) {
    paused = !!value;
    root.setAttribute("data-motion", paused ? "paused" : "playing");
    if (control) {
      control.textContent = paused ? "Resume motion" : "Pause motion";
      control.setAttribute("aria-pressed", String(paused));
    }
    resetTilt();
    clearAnimations();
    if (!paused) animate();
    syncVideos();
    syncParticles();
    requestScrollUpdate();
  }

  if (control) {
    control.hidden = false;
    control.addEventListener("click", function () { setMotion(!paused); });
  }
  listenToPreference(preference, function (event) { setMotion(event.matches); });
  listenToPreference(pointerPreference, function () { if (!canTilt()) resetTilt(); });

  try {
    if (window.IntersectionObserver) {
      videoObserver = new window.IntersectionObserver(syncVideos);
      videos.forEach(function (video) { videoObserver.observe(video); });
    }
  } catch (error) { videoObserver = null; }

  addEventListener("scroll", function () {
    requestScrollUpdate();
    if (!videoObserver) syncVideos();
  }, { passive: true });

  document.addEventListener("visibilitychange", function () {
    if (document.hidden) {
      if (scrollFrame !== null) cancelAnimationFrame(scrollFrame);
      scrollFrame = null;
      resetTilt();
      clearAnimations();
    } else {
      if (!paused && !animationContext) animate();
      requestScrollUpdate();
    }
    syncVideos();
    syncParticles();
  });

  addEventListener("resize", function () {
    sizeParticles();
    if (wide !== (innerWidth > 820)) {
      wide = innerWidth > 820;
      resetTilt();
      clearAnimations();
      if (!paused) animate();
    }
    syncVideos();
    requestScrollUpdate();
  });

  document.addEventListener("focusin", function (event) {
    var element = event.target.closest && event.target.closest(".reveal");
    if (!element) return;
    if (window.gsap && window.gsap.set) {
      window.gsap.set(element, { opacity: 1, y: 0, rotationX: 0, z: 0, overwrite: true });
    } else {
      element.style.opacity = 1;
      element.style.transform = "none";
    }
  });

  function fragmentTarget(fragment) {
    if (!fragment || fragment.charAt(0) !== "#") return null;
    try { return document.getElementById(decodeURIComponent(fragment.slice(1))); }
    catch (error) { return null; }
  }

  function scrollToTarget(target, focus) {
    // A pinned hero's current bounding box is not its document starting point.
    var opening = target.id === "hero" || target.id === "main";
    var destination = opening ? 0 : Math.max(0, target.getBoundingClientRect().top + (window.pageYOffset || root.scrollTop || 0));
    if (focus && target.focus) {
      var temporaryTabIndex = !target.hasAttribute("tabindex");
      if (temporaryTabIndex) {
        target.setAttribute("tabindex", "-1");
        target.addEventListener("blur", function () { target.removeAttribute("tabindex"); }, { once: true });
      }
      try { target.focus({ preventScroll: true }); } catch (error) { target.focus(); }
    }
    if (lenis) {
      lenis.scrollTo(destination, { immediate: true, force: true });
    } else {
      var previousBehavior = root.style.scrollBehavior;
      root.style.scrollBehavior = "auto";
      window.scrollTo({ top: destination, left: 0, behavior: "auto" });
      root.style.scrollBehavior = previousBehavior;
    }
    if (window.ScrollTrigger && window.ScrollTrigger.update) window.ScrollTrigger.update();
    if (opening && heroCamera) {
      var trigger = heroCamera.scrollTrigger;
      var scrub = trigger && trigger.getTween ? trigger.getTween() : null;
      if (scrub && scrub.progress) scrub.progress(1);
      heroCamera.progress(0);
    }
    syncVideos();
    requestScrollUpdate();
  }

  document.querySelectorAll('a[href^="#"]').forEach(function (link) {
    link.addEventListener("click", function (event) {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || (event.button && event.button !== 0)) return;
      var fragment = link.getAttribute("href");
      var target = fragmentTarget(fragment);
      if (!target) return;
      event.preventDefault();
      if (window.location.hash !== fragment) {
        try { window.history.pushState(null, "", fragment); }
        catch (error) { window.location.hash = fragment; }
      }
      scrollToTarget(target, true);
    });
  });

  function followFragment() {
    var target = fragmentTarget(window.location.hash);
    if (target) scrollToTarget(target, false);
  }
  addEventListener("hashchange", followFragment);
  addEventListener("load", function () {
    followFragment();
    requestScrollUpdate();
  });

  sizeParticles();
  setMotion(paused);
})();
