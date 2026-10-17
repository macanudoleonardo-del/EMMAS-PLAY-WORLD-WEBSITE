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
  var pendingTap = null;
  var lastHitPoint = null;
  var introStart = 0;
  var titleStart = 0;
  var titleGroup = null;
  var titleLines = [];
  var titleMaterials = [];
  var titleShadows = [];
  var titleReady = false;
  var titleBuilt = false;
  var titleHero = document.getElementById('hero');
  var titleActor = { isTitle: true, dragX: 0, dragY: 0, impactAt: -Infinity };
  var titleInner = titleHero && titleHero.querySelector('.hero__inner');
  var titleMetricsDirty = true;
  var titleFontDirty = true;
  var titleMeasureUntil = 0;
  var titleNextMeasure = 0;
  var heroBounds = { top: 0, bottom: 0, height: 0 };
  var flowGroup;
  var flowOrbits = [];
  var flowMaterials = [];
  var flowBeads;
  var flowDummy;
  var flowAnchor;
  var flowRadius = 1;
  var flowActor = { isFlow: true, dragX: 0, dragY: 0, impactAt: -Infinity };
  var burstMesh;
  var burstDummy;
  var particles = [];
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
    pendingTap = null;
    body.style.cursor = previousCursor;
    if (pointerTarget) pointerTarget.set(0, 0);
    if (pointerSmooth) pointerSmooth.set(0, 0);
  }

  function cleanup() {
    if (disposed) return;
    disposed = true;
    ready = false;
    root.removeAttribute('data-title3d');
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
    if (titleHero) {
      var heroRect = titleHero.getBoundingClientRect();
      heroBounds.top = heroRect.top;
      heroBounds.bottom = heroRect.bottom;
      heroBounds.height = heroRect.height || heroRect.bottom - heroRect.top;
    }
    titleMetricsDirty = true;
    if (flowGroup) {
      var halfFlowHeight = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * (camera.position.z + 1.5);
      flowRadius = Math.min(width * (mobile ? 0.43 : 0.35), height * 0.62) * halfFlowHeight * 2 / height;
      flowBeads.count = mobile ? 9 : 12;
      for (var m = 0; m < flowMaterials.length; m++) flowMaterials[m].opacity = mobile ? 0.5 : 0.72;
      flowBeads.material.opacity = mobile ? 0.8 : 0.96;
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
      actor.loopX = halfHeight * camera.aspect * (mobile ? 0.04 : 0.055);
      actor.loopY = halfHeight * (mobile ? 0.085 : 0.115);
    });
    layoutDirty = false;
  }

  function draw(animated, delta) {
    if (layoutDirty) layout();
    var follow = animated ? 1 - Math.exp(-delta * 7) : 1;
    pointerSmooth.lerp(pointerTarget, animated ? follow * 0.65 : 1);
    camera.position.x = paused() ? 0 : pointerSmooth.x * 0.5;
    camera.position.y = paused() ? 0 : pointerSmooth.y * 0.32;
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld(true);
    var intro = paused() ? 1 : clamp((elapsed - introStart) / 1.8, 0, 1);
    var arrival = 1 - Math.pow(1 - intro, 3);

    actors.forEach(function (actor) {
      var path = elapsed * (0.42 + actor.seed * 0.02) + actor.seed;
      actor.motionTarget.copy(actor.target);
      actor.motionTarget.x += Math.sin(path) * actor.loopX * arrival;
      actor.motionTarget.y += Math.sin(path * 2 + actor.seed) * actor.loopY * arrival;
      actor.motionTarget.z += Math.cos(path) * 0.28 * arrival;
      actor.group.position.lerp(actor.motionTarget, follow);
      var spread = (1 - arrival) * (actor.seed % 2 ? -1 : 1);
      actor.group.position.x += (actor.target.x >= 0 ? 1 : -1) * (1 - arrival) * 0.15;
      actor.group.position.z = actor.motionTarget.z - (1 - arrival) * 4.8;
      var age = elapsed - actor.impactAt;
      var kick = age < 2.2 && !paused() ? Math.sin(age * 17) * Math.exp(-age * 3.7) : 0;
      var impactSpin = age < 2.2 && !paused() ? Math.PI * 2 * (1 - Math.exp(-age * 4.5)) : 0;
      var hoverScale = (hovered === actor || (dragging && dragging.actor === actor)) && !paused() ? 1.13 : 1;
      var targetScale = actor.size * hoverScale * (0.58 + arrival * 0.42) * (1 + kick * 0.3);
      actor.group.scale.setScalar(mix(actor.group.scale.x, targetScale, follow));
      actor.group.rotation.set(
        actor.rotation[0] + actor.dragX + Math.sin(elapsed * 0.42 + actor.seed) * 0.13 + pointerSmooth.y * 0.24 + spread * 0.65,
        actor.rotation[1] + actor.dragY + (actor.spin ? elapsed * actor.spin : Math.sin(elapsed * 0.38) * 0.2) + pointerSmooth.x * 0.38 + impactSpin + (1 - arrival) * 1.7,
        actor.rotation[2] + Math.sin(elapsed * 0.31 + actor.seed) * 0.08 + kick * 0.15
      );
    });
    updateTitle();
    updateFlow(arrival);
    updateBurst();
    renderer.render(scene, camera);
    if (titleBuilt && !titleReady && titleGroup.visible && !document.hidden) {
      titleReady = true;
      root.setAttribute('data-title3d', 'ready');
      Promise.resolve().then(function () { layoutDirty = true; titleMetricsDirty = true; titleNextMeasure = 0; requestFrame(); });
    }
  }

  function renderStill() {
    stillFrame = 0;
    if (!canRender()) return;
    try { draw(false, 0); } catch (error) { fallback(); }
  }

  function tick(time) {
    frame = 0;
    if (!canRender() || paused()) return;
    var advance = lastTime ? Math.max(0, (time - lastTime) / 1000) : 1 / 60;
    var delta = Math.min(advance, 0.05);
    lastTime = time;
    elapsed += advance;
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
    layoutDirty = true;
    titleMetricsDirty = true;
    titleNextMeasure = 0;
    if (paused()) {
      resetInteraction();
      introStart = elapsed - 2;
      titleStart = elapsed - 2;
      particles = [];
      if (burstMesh) burstMesh.visible = false;
      actors.forEach(function (actor) { actor.impactAt = -Infinity; });
      titleActor.impactAt = -Infinity;
      flowActor.impactAt = -Infinity;
    }
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
    var groups = actors.map(function (actor) { return actor.group; });
    if (flowGroup && flowGroup.visible) groups.push(flowGroup);
    if (titleReady && titleGroup && titleGroup.visible) groups.push(titleGroup);
    var hits = raycaster.intersectObjects(groups, true);
    lastHitPoint = hits.length && hits[0].point ? hits[0].point.clone() : null;
    return hits.length ? hits[0].object.userData.actor || null : null;
  }

  function pointerMove(event) {
    if (pendingTap && pendingTap.pointerId === event.pointerId) {
      if (Math.hypot(event.clientX - pendingTap.x, event.clientY - pendingTap.y) >= 8) pendingTap.moved = true;
      if (event.pointerType !== 'touch' && (event.buttons & 1) === 0) pendingTap = null;
    }
    if (!desktopPointer(event)) return;
    pointerTarget.set(clamp(event.clientX / width * 2 - 1, -1, 1), clamp(1 - event.clientY / height * 2, -1, 1));
    if (dragging && dragging.pointerId === event.pointerId && (event.buttons & 1) === 0) dragging = null;
    if (dragging && dragging.pointerId === event.pointerId) {
      dragging.actor.dragY += (event.clientX - dragging.x) * 0.009;
      dragging.actor.dragX += (event.clientY - dragging.y) * 0.009;
      if (dragging.actor.isTitle) {
        dragging.actor.dragX = clamp(dragging.actor.dragX, -0.25, 0.25);
        dragging.actor.dragY = clamp(dragging.actor.dragY, -0.3, 0.3);
      }
      if (dragging.actor.isFlow) {
        dragging.actor.dragX = clamp(dragging.actor.dragX, -0.16, 0.16);
        dragging.actor.dragY = clamp(dragging.actor.dragY, -0.22, 0.22);
      }
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
    if (paused() || event.button !== 0 || event.isPrimary === false) return;
    var actor = hitActor(event);
    if (!actor) return;
    pendingTap = { actor: actor, pointerId: event.pointerId, x: event.clientX, y: event.clientY, scroll: window.scrollY || 0, time: performance.now(), moved: false };
    if (desktopPointer(event)) {
      dragging = { actor: actor, pointerId: event.pointerId, x: event.clientX, y: event.clientY };
      hovered = actor;
      body.style.cursor = 'grabbing';
    }
    requestFrame();
  }

  function pointerUp(event) {
    if (pendingTap && pendingTap.pointerId === event.pointerId) {
      var tap = pendingTap;
      pendingTap = null;
      if (!paused() && !tap.moved && Math.hypot(event.clientX - tap.x, event.clientY - tap.y) < 8 && Math.abs((window.scrollY || 0) - tap.scroll) < 8 && performance.now() - tap.time < 500 && hitActor(event) === tap.actor) impact(tap.actor, lastHitPoint);
    }
    if (dragging && dragging.pointerId === event.pointerId) dragging = null;
    hovered = desktopPointer(event) ? hitActor(event) : null;
    body.style.cursor = hovered ? 'grab' : previousCursor;
    requestFrame();
  }

  function addActor(group, options) {
    var actor = Object.assign({
      group: group, target: new THREE.Vector3(), motionTarget: new THREE.Vector3(), size: 1, baseSize: 1, loopX: 0, loopY: 0,
      rotation: [0, 0, 0], dragX: 0, dragY: 0, depth: 0, seed: actors.length * 1.7, spin: 0, impactAt: -Infinity
    }, options);
    group.traverse(function (object) { object.userData.actor = actor; });
    actors.push(actor);
    scene.add(group);
    return actor;
  }

  function screenPoint(x, y, depth, target) {
    target.set(x / width * 2 - 1, 1 - y / height * 2, 0.5).unproject(camera).sub(camera.position);
    return target.multiplyScalar((depth - camera.position.z) / target.z).add(camera.position);
  }

  function measureTitle() {
    for (var i = 0; i < titleLines.length; i++) {
      var line = titleLines[i];
      var rect = line.element.getBoundingClientRect();
      var textRect = line.range.getBoundingClientRect();
      if (titleFontDirty || !line.fontSize) line.fontSize = parseFloat(getComputedStyle(line.element).fontSize) || rect.height;
      line.width = Math.min(textRect.width || rect.width, width - 32);
      line.height = Math.min(line.fontSize * 0.78, rect.height * 0.94);
      line.centerX = textRect.width ? textRect.left + textRect.width / 2 : rect.left + rect.width / 2;
      line.centerY = rect.top + rect.height / 2;
    }
    titleMetricsDirty = false;
    titleFontDirty = false;
    titleNextMeasure = performance.now() + 100;
  }

  function updateTitle() {
    if (!titleBuilt || !titleGroup || !titleHero) return;
    var opacity = titleInner && titleInner.style.opacity !== '' ? Number(titleInner.style.opacity) : 1;
    opacity = Number.isFinite(opacity) ? clamp(opacity, 0, 1) : 1;
    titleGroup.visible = heroBounds.bottom > 0 && heroBounds.top < height && opacity > 0.02;
    if (!titleGroup.visible) return;
    var now = performance.now();
    if ((titleMetricsDirty || now < titleMeasureUntil) && now >= titleNextMeasure) measureTitle();
    var p = paused() ? 1 : clamp((elapsed - titleStart) / 1.15, 0, 1);
    var entrance = 1 - Math.pow(1 - p, 3);
    var age = elapsed - titleActor.impactAt;
    var bounce = age < 1.8 && !paused() ? Math.sin(age * 17) * Math.exp(-age * 4) : 0;
    var reveal = opacity * (paused() ? 1 : clamp(p * 5, 0.35, 1));
    titleMaterials.forEach(function (material) { material.opacity = reveal; });
    titleShadows.forEach(function (material) { material.opacity = reveal * 0.1; });
    titleLines.forEach(function (line, index) {
      if (!line.width || !line.height) return;
      var center = screenPoint(line.centerX, line.centerY, 2.65, line.projected[0]);
      var left = screenPoint(line.centerX - line.width / 2, line.centerY, 2.65, line.projected[1]);
      var right = screenPoint(line.centerX + line.width / 2, line.centerY, 2.65, line.projected[2]);
      var upper = screenPoint(line.centerX, line.centerY - line.height / 2, 2.65, line.projected[3]);
      var lower = screenPoint(line.centerX, line.centerY + line.height / 2, 2.65, line.projected[4]);
      var scale = Math.min(left.distanceTo(right) / line.naturalWidth, upper.distanceTo(lower) / line.naturalHeight);
      line.group.position.copy(center);
      if (!paused()) line.group.position.y += Math.sin(elapsed * 0.65 + index * 0.7) * 0.055;
      line.group.position.z -= (1 - entrance) * 3.4;
      line.group.scale.setScalar(scale * (1 + bounce * 0.075));
      line.group.rotation.set(
        0.1 + titleActor.dragX - pointerSmooth.y * 0.17 - (1 - entrance) * 0.48 + bounce * 0.1 + (paused() ? 0 : Math.sin(elapsed * 0.62 + index * 0.6) * 0.055),
        (index ? 0.055 : -0.07) + titleActor.dragY + pointerSmooth.x * 0.18 + (1 - entrance) * 0.2 + (paused() ? 0 : Math.sin(elapsed * 0.48 + index * 0.8) * 0.07),
        bounce * 0.025 + (paused() ? 0 : Math.sin(elapsed * 0.39 + index) * 0.012)
      );
    });
  }

  async function loadTitle() {
    var owned = [];
    function titleKeep(resource) { owned.push(resource); return keep(resource); }
    try {
      var elements = Array.prototype.slice.call(document.querySelectorAll('.hero__line'));
      if (!titleHero || elements.length !== 2) return;
      var modules = await Promise.all([
        import('https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/loaders/FontLoader.js'),
        import('https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/geometries/TextGeometry.js')
      ]);
      var font = await new modules[0].FontLoader().loadAsync('https://cdn.jsdelivr.net/npm/three@0.160.0/examples/fonts/helvetiker_bold.typeface.json');
      if (disposed || !canvas.isConnected) return;
      var mobile = width <= 820 || !finePointer.matches;
      var colors = [0xff4da6, 0x995de8, 0x24badd];
      var faces = colors.map(function (color) {
        return titleKeep(new THREE.MeshPhysicalMaterial({ color: color, roughness: 0.24, metalness: 0.19, clearcoat: 1, clearcoatRoughness: 0.14, transparent: true }));
      });
      var side = titleKeep(new THREE.MeshPhysicalMaterial({ color: 0x703393, roughness: 0.28, metalness: 0.35, clearcoat: 0.7, transparent: true }));
      titleMaterials = faces.concat([side]);
      titleGroup = new THREE.Group();
      titleActor.group = titleGroup;
      var wordIndex = 0;
      elements.forEach(function (element) {
        var group = new THREE.Group();
        var content = new THREE.Group();
        var cursor = 0;
        var minY = Infinity;
        var maxY = -Infinity;
        var faceElement = element.querySelector('.hero__face') || element;
        var words = (element.getAttribute('data-text') || faceElement.textContent).trim().split(/\s+/);
        words.forEach(function (word) {
          var geometry = titleKeep(new modules[1].TextGeometry(word, {
            font: font, size: 1, height: 0.32, curveSegments: mobile ? 4 : 6,
            bevelEnabled: true, bevelSegments: mobile ? 2 : 3, bevelThickness: 0.045, bevelSize: 0.026, steps: 1
          }));
          geometry.translate(0, 0, -0.16);
          geometry.computeBoundingBox();
          var box = geometry.boundingBox;
          var mesh = new THREE.Mesh(geometry, [faces[wordIndex % faces.length], side]);
          mesh.position.x = cursor - box.min.x;
          mesh.castShadow = true;
          mesh.userData.actor = titleActor;
          content.add(mesh);
          cursor += box.max.x - box.min.x + 0.34;
          minY = Math.min(minY, box.min.y);
          maxY = Math.max(maxY, box.max.y);
          wordIndex++;
        });
        var naturalWidth = cursor - 0.34;
        var naturalHeight = maxY - minY;
        var centerY = (minY + maxY) / 2;
        content.position.set(-naturalWidth / 2, -centerY, 0);
        var shadowMaterial = titleKeep(new THREE.ShadowMaterial({ color: 0x6a337e, opacity: 0.1, depthWrite: false }));
        titleShadows.push(shadowMaterial);
        var shadow = new THREE.Mesh(titleKeep(new THREE.PlaneGeometry(naturalWidth + 3, naturalHeight + 3)), shadowMaterial);
        shadow.position.set(naturalWidth / 2, centerY, -0.38);
        shadow.receiveShadow = true;
        shadow.raycast = function () {};
        content.add(shadow);
        group.add(content);
        titleGroup.add(group);
        var range = document.createRange();
        range.selectNodeContents(faceElement);
        removers.push(function () { if (range.detach) range.detach(); });
        titleLines.push({ group: group, element: element, range: range, naturalWidth: naturalWidth, naturalHeight: naturalHeight,
          width: 0, height: 0, fontSize: 0, centerX: 0, centerY: 0,
          projected: [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()] });
      });
      titleGroup.visible = false;
      scene.add(titleGroup);
      titleBuilt = true;
      titleStart = paused() ? elapsed - 2 : elapsed - 0.12;
      layoutDirty = true;
      titleFontDirty = true;
      titleNextMeasure = 0;
      requestFrame();
    } catch (error) {
      if (titleGroup && scene) scene.remove(titleGroup);
      titleGroup = null;
      titleBuilt = false;
      titleReady = false;
      titleLines = [];
      titleMaterials = [];
      titleShadows = [];
      root.removeAttribute('data-title3d');
      owned.forEach(function (resource) { try { resource.dispose(); } catch (ignored) {} });
    }
  }

  function buildFlow() {
    flowGroup = new THREE.Group();
    flowActor.group = flowGroup;
    flowAnchor = new THREE.Vector3();
    var ribbon = keep(new THREE.TorusGeometry(1, 0.015, 8, 96));
    var colors = [0xefbf69, 0xf6a6d3, 0xb8a1e7];
    var settings = [
      { radius: 1, flat: 0.24, mobileFlat: 0.3, tilt: 0.65, turn: -0.08, speed: 0.38 },
      { radius: 0.87, flat: 0.34, mobileFlat: 0.38, tilt: -0.55, turn: 0.075, speed: -0.46 },
      { radius: 1.08, flat: 0.18, mobileFlat: 0.23, tilt: 0.85, turn: 0.025, speed: 0.29 }
    ];
    for (var i = 0; i < 3; i++) {
      var material = keep(new THREE.MeshPhysicalMaterial({
        color: colors[i], roughness: 0.24, metalness: 0.58, clearcoat: 1,
        clearcoatRoughness: 0.18, transparent: true, opacity: 0.72, depthWrite: false
      }));
      flowMaterials.push(material);
      var group = new THREE.Group();
      var ring = new THREE.Mesh(ribbon, material);
      ring.userData.actor = flowActor;
      group.add(ring);
      flowGroup.add(group);
      settings[i].group = group;
      flowOrbits.push(settings[i]);
    }
    var beadGeometry = keep(new THREE.SphereGeometry(1, 14, 10));
    var beadMaterial = keep(new THREE.MeshPhysicalMaterial({
      color: 0xffffff, metalness: 0.22, roughness: 0.2, clearcoat: 1,
      iridescence: 0.25, transparent: true, opacity: 0.96, depthWrite: false
    }));
    flowBeads = keep(new THREE.InstancedMesh(beadGeometry, beadMaterial, 12));
    flowBeads.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    flowBeads.frustumCulled = false;
    flowBeads.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1.5);
    flowBeads.userData.actor = flowActor;
    var palette = [0xffe3f3, 0xf2d7a6, 0xd7c6f2, 0xc7eaf2];
    for (var bead = 0; bead < 12; bead++) flowBeads.setColorAt(bead, new THREE.Color(palette[bead % palette.length]));
    if (flowBeads.instanceColor) flowBeads.instanceColor.needsUpdate = true;
    flowDummy = new THREE.Object3D();
    flowGroup.add(flowBeads);
    flowGroup.visible = false;
    scene.add(flowGroup);
  }

  function updateFlow(arrival) {
    if (!flowGroup || !titleHero) return;
    var opacity = titleInner && titleInner.style.opacity !== '' ? Number(titleInner.style.opacity) : 1;
    opacity = Number.isFinite(opacity) ? clamp(opacity, 0, 1) : 1;
    flowGroup.visible = heroBounds.bottom > 0 && heroBounds.top < height && opacity > 0.02;
    if (!flowGroup.visible) return;
    var mobile = width <= 820 || !finePointer.matches;
    var phase = elapsed;
    var age = elapsed - flowActor.impactAt;
    var spring = age < 2 && !paused() ? Math.sin(age * 15) * Math.exp(-age * 3.4) : 0;
    var hover = hovered === flowActor && !paused() ? 0.025 : 0;
    var centerY = heroBounds.top + heroBounds.height * (mobile ? 0.225 : 0.255);
    if (mobile && titleBuilt) {
      var titleCenters = 0;
      var measuredLines = 0;
      for (var lineIndex = 0; lineIndex < titleLines.length; lineIndex++) {
        if (titleLines[lineIndex].width > 0) {
          titleCenters += titleLines[lineIndex].centerY;
          measuredLines++;
        }
      }
      if (measuredLines) centerY = titleCenters / measuredLines;
    }
    screenPoint(width / 2, centerY, -1.5, flowAnchor);
    flowGroup.position.copy(flowAnchor);
    flowGroup.scale.setScalar(flowRadius * (0.82 + arrival * 0.18) * (1 + spring * 0.09 + hover));
    flowGroup.rotation.set(
      flowActor.dragX - pointerSmooth.y * 0.055,
      flowActor.dragY + pointerSmooth.x * 0.075,
      Math.sin(phase * 0.21) * 0.018 + spring * 0.035
    );
    for (var orbitIndex = 0; orbitIndex < flowOrbits.length; orbitIndex++) {
      var orbit = flowOrbits[orbitIndex];
      orbit.group.rotation.set(
        orbit.tilt + Math.sin(phase * 0.31 + orbitIndex * 1.7) * 0.12,
        Math.cos(phase * 0.24 + orbitIndex) * 0.08,
        orbit.turn + Math.sin(phase * 0.19 + orbitIndex) * 0.025
      );
      orbit.group.scale.set(orbit.radius, orbit.radius * (mobile ? orbit.mobileFlat : orbit.flat), orbit.radius);
      orbit.group.updateMatrix();
      flowMaterials[orbitIndex].opacity = (mobile ? 0.5 : 0.72) * opacity;
    }
    var seats = flowBeads.count / 3;
    for (var instance = 0; instance < flowBeads.count; instance++) {
      var path = flowOrbits[instance % 3];
      var angle = phase * path.speed + Math.floor(instance / 3) / seats * Math.PI * 2 + instance % 3 * 0.7;
      flowDummy.position.set(Math.cos(angle), Math.sin(angle), 0).applyMatrix4(path.group.matrix);
      flowDummy.rotation.set(angle, angle * 0.6, 0);
      flowDummy.scale.setScalar((instance < 3 ? 0.034 : 0.023) * (1 + Math.sin(phase * 1.3 + instance) * 0.1));
      flowDummy.updateMatrix();
      flowBeads.setMatrixAt(instance, flowDummy.matrix);
    }
    flowBeads.material.opacity = (mobile ? 0.8 : 0.96) * opacity;
    flowBeads.instanceMatrix.needsUpdate = true;
  }

  function buildBurst() {
    var geometry = keep(new THREE.IcosahedronGeometry(0.07, 0));
    var material = keep(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3, metalness: 0.35 }));
    burstMesh = new THREE.InstancedMesh(geometry, material, 24);
    burstMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    burstMesh.frustumCulled = false;
    burstMesh.visible = false;
    burstDummy = new THREE.Object3D();
    scene.add(burstMesh);
  }

  function impact(actor, point) {
    actor.impactAt = elapsed;
    var origin = point || (actor.isTitle && titleLines.length ? titleLines[0].group.position : actor.group.position);
    var count = width <= 820 ? 12 : 20;
    particles = [];
    for (var i = 0; i < count; i++) {
      var angle = i / count * Math.PI * 2;
      particles.push({
        position: origin.clone(), velocity: new THREE.Vector3(Math.cos(angle) * (0.8 + Math.random()), Math.sin(angle) * (0.8 + Math.random()), (Math.random() - 0.5) * 1.8),
        start: elapsed, life: 0.8 + Math.random() * 0.35, seed: Math.random() * 6
      });
      burstMesh.setColorAt(i, new THREE.Color([0xff6cbd, 0xf4c36b, 0xb49be9, 0x4fcadf][i % 4]));
    }
    if (burstMesh.instanceColor) burstMesh.instanceColor.needsUpdate = true;
    requestFrame();
  }

  function updateBurst() {
    if (!burstMesh || !particles.length) { if (burstMesh) burstMesh.visible = false; return; }
    var live = 0;
    particles.forEach(function (particle) {
      var age = elapsed - particle.start;
      if (age >= particle.life) return;
      var progress = age / particle.life;
      burstDummy.position.copy(particle.position).addScaledVector(particle.velocity, age);
      burstDummy.position.y -= age * age * 0.8;
      burstDummy.rotation.set(age * 4 + particle.seed, age * 5, particle.seed);
      burstDummy.scale.setScalar((1 - progress) * 0.9);
      burstDummy.updateMatrix();
      burstMesh.setMatrixAt(live++, burstDummy.matrix);
    });
    burstMesh.count = live;
    burstMesh.visible = live > 0;
    burstMesh.instanceMatrix.needsUpdate = true;
    if (!live) particles = [];
  }

  function replay() {
    if (paused() || !ready || disposed) return;
    introStart = elapsed;
    titleStart = elapsed;
    resetInteraction();
    titleActor.dragX = 0;
    titleActor.dragY = 0;
    titleActor.impactAt = -Infinity;
    flowActor.dragX = 0;
    flowActor.dragY = 0;
    flowActor.impactAt = -Infinity;
    actors.forEach(function (actor) { actor.dragX = 0; actor.dragY = 0; actor.impactAt = -Infinity; });
    particles = [];
    requestFrame();
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
    addActor(heart, { cover: [0.86, -0.03], worlds: [0.89, 0.26], orbit: [0.73, 0.03], rotation: [0.08, -0.34, -0.14], baseSize: 0.98, depth: 0.4 });

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
    addActor(orbit, { cover: [-0.9, 0.34], worlds: [-0.91, -0.17], orbit: [-0.76, 0.1], rotation: [0.2, 0.3, -0.22], baseSize: 1.18, depth: -0.25, spin: 0.11 });

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
    var replayButton = document.getElementById('replayEntrance');
    if (replayButton) listen(replayButton, 'click', replay);
    listen(window, 'scroll', function () {
      layoutDirty = true;
      titleMetricsDirty = true;
      titleMeasureUntil = performance.now() + 1000;
      requestFrame();
    }, { passive: true });
    listen(window, 'resize', function () {
      titleFontDirty = true;
      titleMeasureUntil = performance.now() + 1000;
      layoutDirty = true;
      resetInteraction();
      syncMotion();
    }, { passive: true });
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
      var changed = function () { layoutDirty = true; titleFontDirty = true; resetInteraction(); syncMotion(); };
      if (query.addEventListener) {
        listen(query, 'change', changed);
      } else if (query.addListener) {
        query.addListener(changed);
        removers.push(function () { query.removeListener(changed); });
      }
    });
    if (document.fonts && document.fonts.ready) {
      var fontsChanged = function () {
        if (disposed) return;
        titleFontDirty = true;
        titleMetricsDirty = true;
        titleNextMeasure = 0;
        layoutDirty = true;
        requestFrame();
      };
      document.fonts.ready.then(fontsChanged, function () {});
      if (document.fonts.addEventListener) listen(document.fonts, 'loadingdone', fontsChanged);
    }

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
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
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
      key.castShadow = true;
      key.shadow.mapSize.set(window.innerWidth <= 820 ? 512 : 1024, window.innerWidth <= 820 ? 512 : 1024);
      key.shadow.camera.left = -12;
      key.shadow.camera.right = 12;
      key.shadow.camera.top = 10;
      key.shadow.camera.bottom = -10;
      key.shadow.camera.near = 0.5;
      key.shadow.camera.far = 40;
      key.shadow.bias = -0.0005;
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
      buildFlow();
      buildBurst();
      layoutDirty = true;
      draw(false, 0);
      ready = true;
      setStatus('ready');
      connectEvents();
      syncMotion();
      loadTitle();
    } catch (error) {
      fallback();
    }
  }

  start();
})();
