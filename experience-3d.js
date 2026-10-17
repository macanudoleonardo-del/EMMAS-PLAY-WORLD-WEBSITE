/* Emma's Play World: optional, procedural WebGL decoration and interaction. */
(function () {
  'use strict';

  var canvas = document.getElementById('world3d');
  if (!canvas || canvas.getAttribute('data-initialized') === 'true') return;
  canvas.setAttribute('data-initialized', 'true');

  var root = document.documentElement;
  var body = document.body;
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  var finePointer = window.matchMedia('(hover: hover) and (pointer: fine)');
  var renderer;
  var scene;
  var camera;
  var THREE;
  var actors = [];
  var resources = [];
  var removers = [];
  var motionObserver;
  var visibilityObserver;
  var disposed = false;
  var ready = false;
  var inView = true;
  var pageSuspended = false;
  var frame = 0;
  var stillFrame = 0;
  var lastTime = 0;
  var elapsed = 0;
  var layoutDirty = true;
  var width = 1;
  var height = 1;
  var pixelRatio = 0;
  var worldsMix = 0;
  var orbMix = 0;
  var orbY = 0;
  var raycaster;
  var pointerTarget;
  var pointerSmooth;
  var rayPointer;
  var hovered = null;
  var dragging = null;
  var previousCursor = body.style.cursor;

  function setStatus(status) {
    root.setAttribute('data-3d', status);
    body.classList.toggle('has-3d', status === 'ready');
    body.classList.toggle('has-3d-fallback', status === 'fallback');
    canvas.hidden = status !== 'ready';
  }

  function paused() {
    var motion = root.getAttribute('data-motion');
    return motion === null ? reduceMotion.matches : motion === 'paused';
  }

  function canRender() {
    return ready && !disposed && inView && !document.hidden && !pageSuspended;
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function mix(a, b, t) {
    return a + (b - a) * t;
  }

  function keep(resource) {
    resources.push(resource);
    return resource;
  }

  function listen(target, type, handler, options) {
    target.addEventListener(type, handler, options);
    removers.push(function () { target.removeEventListener(type, handler, options); });
  }

  function stopFrames() {
    if (frame) cancelAnimationFrame(frame);
    if (stillFrame) cancelAnimationFrame(stillFrame);
    frame = 0;
    stillFrame = 0;
    lastTime = 0;
  }

  function resetInteraction() {
    hovered = null;
    dragging = null;
    body.style.cursor = previousCursor;
    if (pointerTarget) pointerTarget.set(0, 0);
    if (pointerSmooth) pointerSmooth.set(0, 0);
  }

  function cleanup() {
    if (disposed) return;
    disposed = true;
    ready = false;
    stopFrames();
    resetInteraction();
    if (motionObserver) motionObserver.disconnect();
    if (visibilityObserver) visibilityObserver.disconnect();
    removers.forEach(function (remove) { remove(); });
    resources.forEach(function (resource) {
      try { resource.dispose(); } catch (ignored) {}
    });
    if (renderer) {
      try { renderer.dispose(); } catch (ignored) {}
    }
  }

  function fallback() {
    cleanup();
    setStatus('fallback');
  }

  function layout() {
    var mobile = window.innerWidth <= 820 || !finePointer.matches;
    var nextWidth = Math.max(1, window.innerWidth);
    var nextHeight = Math.max(1, window.innerHeight);
    var nextRatio = Math.min(window.devicePixelRatio || 1, mobile ? 1.5 : 2);
    if (nextWidth !== width || nextHeight !== height || nextRatio !== pixelRatio) {
      width = nextWidth;
      height = nextHeight;
      if (nextRatio !== pixelRatio) renderer.setPixelRatio(nextRatio);
      pixelRatio = nextRatio;
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    }

    var worlds = document.getElementById('worlds');
    worldsMix = worlds ? clamp((height - worlds.getBoundingClientRect().top) / (height * 1.2), 0, 1) : 0;
    var orb = document.getElementById('orb');
    orbMix = orb ? clamp((height - orb.getBoundingClientRect().top) / (height * 1.15), 0, 1) : 0;
    var globe = orb && orb.querySelector('.orb');
    if (globe && orbMix > 0) {
      var globeRect = globe.getBoundingClientRect();
      orbY = clamp(1 - ((globeRect.top + globeRect.height / 2) / height) * 2, -0.7, 0.7);
    }

    actors.forEach(function (actor) {
      var nx = mix(actor.cover[0], actor.worlds[0], worldsMix);
      var ny = mix(actor.cover[1], actor.worlds[1], worldsMix);
      nx = mix(nx, actor.orbit[0], orbMix);
      ny = mix(ny, clamp(orbY + actor.orbit[1], -0.83, 0.83), orbMix);
      var depth = camera.position.z - actor.depth;
      var halfHeight = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * depth;
      actor.target.set(nx * halfHeight * camera.aspect, ny * halfHeight, actor.depth);
      actor.size = actor.baseSize * (mobile ? Math.min(0.62, (width / height) * 0.8) : 1);
    });
    layoutDirty = false;
  }

  function draw(animated, delta) {
    if (layoutDirty) layout();
    var follow = animated ? 1 - Math.exp(-delta * 7) : 1;
    pointerSmooth.lerp(pointerTarget, animated ? follow * 0.65 : 1);
    camera.position.x = paused() ? 0 : pointerSmooth.x * 0.18;
    camera.position.y = paused() ? 0 : pointerSmooth.y * 0.12;
    camera.lookAt(0, 0, 0);

    actors.forEach(function (actor) {
      actor.group.position.lerp(actor.target, follow);
      if (animated) actor.group.position.y += Math.sin(elapsed * 0.65 + actor.seed) * 0.1 * follow;
      var hoverScale = (hovered === actor || (dragging && dragging.actor === actor)) && !paused() ? 1.13 : 1;
      var targetScale = actor.size * hoverScale;
      actor.group.scale.setScalar(mix(actor.group.scale.x, targetScale, follow));
      actor.group.rotation.set(
        actor.rotation[0] + actor.dragX + Math.sin(elapsed * 0.42 + actor.seed) * 0.13 + pointerSmooth.y * 0.09,
        actor.rotation[1] + actor.dragY + (actor.spin ? elapsed * actor.spin : Math.sin(elapsed * 0.38) * 0.2) + pointerSmooth.x * 0.14,
        actor.rotation[2] + Math.sin(elapsed * 0.31 + actor.seed) * 0.08
      );
    });
    renderer.render(scene, camera);
  }

  function renderStill() {
    stillFrame = 0;
    if (!canRender()) return;
    try { draw(false, 0); } catch (error) { fallback(); }
  }

  function tick(time) {
    frame = 0;
    if (!canRender() || paused()) return;
    var delta = lastTime ? Math.min((time - lastTime) / 1000, 0.05) : 1 / 60;
    lastTime = time;
    elapsed += delta;
    try { draw(true, delta); } catch (error) { fallback(); return; }
    frame = requestAnimationFrame(tick);
  }

  function requestFrame() {
    if (!canRender()) return;
    if (paused()) {
      if (!stillFrame) stillFrame = requestAnimationFrame(renderStill);
    } else if (!frame) {
      frame = requestAnimationFrame(tick);
    }
  }

  function syncMotion() {
    stopFrames();
    if (paused()) resetInteraction();
    canvas.style.visibility = inView ? 'visible' : 'hidden';
    requestFrame();
  }

  function interactiveTarget(target) {
    return target && target.closest && target.closest('a,button,input,select,textarea,label,video,iframe,[role="button"],[contenteditable]');
  }

  function desktopPointer(event) {
    return finePointer.matches && width > 820 && event.pointerType !== 'touch' && !paused();
  }

  function hitActor(event) {
    if (!canRender() || interactiveTarget(event.target) || event.clientX >= width || event.clientY >= height) return null;
    rayPointer.set(event.clientX / width * 2 - 1, -(event.clientY / height) * 2 + 1);
    scene.updateMatrixWorld(true);
    camera.updateMatrixWorld(true);
    raycaster.setFromCamera(rayPointer, camera);
    var hits = raycaster.intersectObjects(actors.map(function (actor) { return actor.group; }), true);
    return hits.length ? hits[0].object.userData.actor || null : null;
  }

  function pointerMove(event) {
    if (!desktopPointer(event)) return;
    pointerTarget.set(clamp(event.clientX / width * 2 - 1, -1, 1), clamp(1 - event.clientY / height * 2, -1, 1));
    if (dragging && dragging.pointerId === event.pointerId && (event.buttons & 1) === 0) dragging = null;
    if (dragging && dragging.pointerId === event.pointerId) {
      dragging.actor.dragY += (event.clientX - dragging.x) * 0.009;
      dragging.actor.dragX += (event.clientY - dragging.y) * 0.009;
      dragging.x = event.clientX;
      dragging.y = event.clientY;
      body.style.cursor = 'grabbing';
    } else {
      hovered = hitActor(event);
      body.style.cursor = hovered ? 'grab' : previousCursor;
    }
    requestFrame();
  }

  function pointerDown(event) {
    if (!desktopPointer(event) || event.button !== 0 || event.isPrimary === false) return;
    var actor = hitActor(event);
    if (!actor) return;
    dragging = { actor: actor, pointerId: event.pointerId, x: event.clientX, y: event.clientY };
    hovered = actor;
    body.style.cursor = 'grabbing';
    requestFrame();
  }

  function pointerUp(event) {
    if (!dragging || dragging.pointerId !== event.pointerId) return;
    dragging = null;
    hovered = desktopPointer(event) ? hitActor(event) : null;
    body.style.cursor = hovered ? 'grab' : previousCursor;
    requestFrame();
  }

  function addActor(group, options) {
    var actor = Object.assign({
      group: group, target: new THREE.Vector3(), size: 1, baseSize: 1,
      rotation: [0, 0, 0], dragX: 0, dragY: 0, depth: 0, seed: actors.length * 1.7, spin: 0
    }, options);
    group.traverse(function (object) { object.userData.actor = actor; });
    actors.push(actor);
    scene.add(group);
    return actor;
  }

  function environment() {
    // Broad, procedural studio lights give the gold and pearl real reflections.
    var mapCanvas = document.createElement('canvas');
    mapCanvas.width = 512;
    mapCanvas.height = 256;
    var context = mapCanvas.getContext('2d');
    if (!context) return;
    var gradient = context.createLinearGradient(0, 0, 0, 256);
    gradient.addColorStop(0, '#bca1cf');
    gradient.addColorStop(0.5, '#59405e');
    gradient.addColorStop(1, '#23142e');
    context.fillStyle = gradient;
    context.fillRect(0, 0, 512, 256);
    [[85, 70, 100, 'rgba(255,242,220,1)'], [340, 80, 125, 'rgba(239,224,255,1)'], [450, 190, 65, 'rgba(255,177,207,.7)']].forEach(function (light) {
      var glow = context.createRadialGradient(light[0], light[1], 0, light[0], light[1], light[2]);
      glow.addColorStop(0, light[3]);
      glow.addColorStop(1, 'rgba(255,255,255,0)');
      context.fillStyle = glow;
      context.fillRect(0, 0, 512, 256);
    });
    var texture = new THREE.CanvasTexture(mapCanvas);
    texture.mapping = THREE.EquirectangularReflectionMapping;
    texture.colorSpace = THREE.SRGBColorSpace;
    var pmrem = new THREE.PMREMGenerator(renderer);
    try {
      var target = keep(pmrem.fromEquirectangular(texture));
      scene.environment = target.texture;
    } finally {
      texture.dispose();
      pmrem.dispose();
    }
  }

  function buildObjects() {
    var pink = keep(new THREE.MeshPhysicalMaterial({ color: 0xff68bc, metalness: 0.24, roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.16 }));
    var heartEdge = keep(new THREE.MeshPhysicalMaterial({ color: 0xb5358c, metalness: 0.32, roughness: 0.29, clearcoat: 1 }));
    var gold = keep(new THREE.MeshPhysicalMaterial({ color: 0xefbd58, metalness: 0.82, roughness: 0.22, clearcoat: 0.7 }));
    var pearl = keep(new THREE.MeshPhysicalMaterial({ color: 0xddc9ef, metalness: 0.12, roughness: 0.2, clearcoat: 1, iridescence: 0.35, iridescenceIOR: 1.3 }));
    var lilac = keep(new THREE.MeshPhysicalMaterial({ color: 0xbda4f5, metalness: 0.24, roughness: 0.19, clearcoat: 1, flatShading: true }));

    var heartShape = new THREE.Shape();
    heartShape.moveTo(0, -0.95);
    heartShape.bezierCurveTo(-0.2, -0.7, -1.15, -0.1, -1.15, 0.55);
    heartShape.bezierCurveTo(-1.15, 1.25, -0.3, 1.45, 0, 0.8);
    heartShape.bezierCurveTo(0.3, 1.45, 1.15, 1.25, 1.15, 0.55);
    heartShape.bezierCurveTo(1.15, -0.1, 0.2, -0.7, 0, -0.95);
    var heartGeometry = keep(new THREE.ExtrudeGeometry(heartShape, { depth: 0.34, bevelEnabled: true, bevelSegments: 4, bevelSize: 0.15, bevelThickness: 0.16, steps: 1, curveSegments: 18 }));
    heartGeometry.center();
    var heart = new THREE.Group();
    heart.add(new THREE.Mesh(heartGeometry, [pink, heartEdge]));
    addActor(heart, { cover: [0.8, -0.02], worlds: [0.89, 0.26], orbit: [0.73, 0.03], rotation: [0.08, -0.34, -0.14], baseSize: 0.83, depth: 0.4 });

    var orbit = new THREE.Group();
    var ringGeometry = keep(new THREE.TorusGeometry(1.05, 0.065, 12, 80));
    var ringA = new THREE.Mesh(ringGeometry, gold);
    var ringB = new THREE.Mesh(ringGeometry, gold);
    ringA.rotation.x = 0.9;
    ringB.rotation.set(-0.6, 0.5, 0.55);
    ringB.scale.setScalar(0.82);
    orbit.add(ringA, ringB);
    var satelliteGeometry = keep(new THREE.SphereGeometry(0.16, 20, 12));
    var satellite = new THREE.Mesh(satelliteGeometry, pearl);
    satellite.position.set(1.01, 0.24, 0.02);
    orbit.add(satellite);
    addActor(orbit, { cover: [-0.86, 0.29], worlds: [-0.91, -0.17], orbit: [-0.76, 0.1], rotation: [0.2, 0.3, -0.22], baseSize: 1.05, depth: -0.25, spin: 0.11 });

    var gem = new THREE.Group();
    var gemGeometry = keep(new THREE.OctahedronGeometry(0.7, 0));
    gem.add(new THREE.Mesh(gemGeometry, lilac));
    var edges = keep(new THREE.EdgesGeometry(gemGeometry));
    var edgeMaterial = keep(new THREE.LineBasicMaterial({ color: 0xf6e9ff, transparent: true, opacity: 0.3 }));
    var facets = new THREE.LineSegments(edges, edgeMaterial);
    facets.raycast = function () {};
    gem.add(facets);
    addActor(gem, { cover: [0.74, 0.72], worlds: [0.86, 0.7], orbit: [0.63, 0.57], rotation: [0.25, 0.5, 0.18], baseSize: 0.86, depth: -0.5, spin: 0.16 });

    var pearlGroup = new THREE.Group();
    var pearlGeometry = keep(new THREE.SphereGeometry(0.43, 24, 16));
    pearlGroup.add(new THREE.Mesh(pearlGeometry, pearl));
    var smallRing = new THREE.Mesh(keep(new THREE.TorusGeometry(0.64, 0.025, 8, 56)), gold);
    smallRing.rotation.set(0.6, 0.2, -0.35);
    pearlGroup.add(smallRing);
    addActor(pearlGroup, { cover: [-0.86, -0.62], worlds: [-0.9, -0.66], orbit: [-0.76, -0.5], rotation: [0, 0, 0.1], baseSize: 0.85, depth: -0.7, spin: 0.08 });
  }

  function connectEvents() {
    listen(window, 'scroll', function () { layoutDirty = true; requestFrame(); }, { passive: true });
    listen(window, 'resize', function () { layoutDirty = true; resetInteraction(); syncMotion(); }, { passive: true });
    listen(window, 'pointermove', pointerMove, { passive: true });
    listen(window, 'pointerdown', pointerDown, { passive: true });
    listen(window, 'pointerup', pointerUp, { passive: true });
    listen(window, 'pointercancel', function () { resetInteraction(); requestFrame(); }, { passive: true });
    listen(window, 'blur', function () { resetInteraction(); requestFrame(); });
    listen(document, 'visibilitychange', syncMotion);
    listen(window, 'pagehide', function (event) {
      pageSuspended = true;
      stopFrames();
      if (!event.persisted) cleanup();
    });
    listen(window, 'pageshow', function () { pageSuspended = false; layoutDirty = true; syncMotion(); });
    listen(canvas, 'webglcontextlost', function (event) { event.preventDefault(); fallback(); });

    motionObserver = new MutationObserver(syncMotion);
    motionObserver.observe(root, { attributes: true, attributeFilter: ['data-motion'] });
    [reduceMotion, finePointer].forEach(function (query) {
      var changed = function () { layoutDirty = true; resetInteraction(); syncMotion(); };
      if (query.addEventListener) {
        listen(query, 'change', changed);
      } else if (query.addListener) {
        query.addListener(changed);
        removers.push(function () { query.removeListener(changed); });
      }
    });

    var sections = Array.prototype.slice.call(document.querySelectorAll('main section'));
    if ('IntersectionObserver' in window && sections.length) {
      var visibility = new Map();
      sections.forEach(function (section) {
        var rect = section.getBoundingClientRect();
        visibility.set(section, rect.bottom >= -140 && rect.top <= height + 140);
      });
      visibilityObserver = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) { visibility.set(entry.target, entry.isIntersecting); });
        var visible = false;
        visibility.forEach(function (value) { visible = visible || value; });
        if (visible !== inView) { inView = visible; syncMotion(); }
      }, { rootMargin: '140px 0px', threshold: 0 });
      sections.forEach(function (section) { visibilityObserver.observe(section); });
    }
  }

  async function start() {
    setStatus('loading');
    try {
      var attributes = { alpha: true, antialias: true, premultipliedAlpha: true, powerPreference: 'high-performance' };
      var context = canvas.getContext('webgl2', attributes) || canvas.getContext('webgl', attributes);
      if (!context) { fallback(); return; }
      THREE = await import('https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js');
      if (disposed || !canvas.isConnected) { fallback(); return; }
      renderer = new THREE.WebGLRenderer({ canvas: canvas, context: context, alpha: true, antialias: true });
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.08;
      renderer.setClearColor(0x000000, 0);
      scene = new THREE.Scene();
      camera = new THREE.PerspectiveCamera(38, 1, 0.1, 60);
      camera.position.set(0, 0, 16);
      raycaster = new THREE.Raycaster();
      pointerTarget = new THREE.Vector2();
      pointerSmooth = new THREE.Vector2();
      rayPointer = new THREE.Vector2();
      scene.add(new THREE.AmbientLight(0xffefff, 1.1));
      var key = new THREE.DirectionalLight(0xfff3df, 3.2);
      key.position.set(-4, 7, 9);
      scene.add(key);
      var rim = new THREE.DirectionalLight(0xbba1ff, 2.2);
      rim.position.set(6, -2, 5);
      scene.add(rim);
      var blush = new THREE.PointLight(0xffb9df, 18, 30);
      blush.position.set(-3, -2, 7);
      scene.add(blush);
      layout();
      environment();
      buildObjects();
      layoutDirty = true;
      draw(false, 0);
      ready = true;
      setStatus('ready');
      connectEvents();
      syncMotion();
    } catch (error) {
      fallback();
    }
  }

  start();
})();
