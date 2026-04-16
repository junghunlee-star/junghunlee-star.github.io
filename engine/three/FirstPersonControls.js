import { MathUtils, Quaternion, Spherical, Vector2, Vector3, Euler } from 'three'

const _lookDirection = new Vector3()
const _spherical = new Spherical()
const _target = new Vector3()
// Scratch vectors for the horizontal-lock movement path.
const _forward = new Vector3()
const _right = new Vector3()

class FirstPersonControls {
  constructor(object, domElement) {
    this.object = object
    this.domElement = domElement

    // API

    this.enabled = true

    this.name = '';

    this.movementSpeed = 1.0
    this.lookSpeed = 0.005

    this.lookVertical = true
    this.autoForward = false

    // When true, WASD movement is projected onto the world XZ plane so
    // pitch (looking up/down) never changes the camera height. R/F
    // still move vertically as an explicit override. Mirrors the
    // "walk mode" feel of the PlayCanvas viewer in 05_test_viewer.
    this.horizontalLock = false

    // Speed tiers — 1..5 map to multipliers on `movementSpeed`. Tier 2
    // is the default ("normal" speed). Shift adds a sprint multiplier
    // on top while held. Applied in `update()` so joystick code in the
    // viewer can read the same composed value via `effectiveSpeedMultiplier()`.
    this.speedTiers = [0.3, 1, 2, 4, 8]
    this.speedTier = 2
    this.sprintFactor = 2
    this.sprint = false

    this.activeLook = true

    this.heightSpeed = false
    this.heightCoef = 1.0
    this.heightMin = 0.0
    this.heightMax = 1.0

    this.constrainVertical = false
    this.verticalMin = 0
    this.verticalMax = Math.PI

    this.mouseDragOn = false

    // internals

    this.autoSpeedFactor = 0.0

    this.pointerX = 0
    this.pointerY = 0

    this.moveForward = false
    this.moveBackward = false
    this.moveLeft = false
    this.moveRight = false

    this.viewHalfX = 0
    this.viewHalfY = 0

    // private variables

    let lat = 0
    let lon = 0

    this.rotateStart = new Vector2()
    this.rotateEnd = new Vector2()
    this.rotateDelta = new Vector2()
    this.sphericalDelta = new Spherical()
    //

    this.handleResize = function () {
      if (this.domElement === document) {
        this.viewHalfX = window.innerWidth / 2
        this.viewHalfY = window.innerHeight / 2
      } else {
        this.viewHalfX = this.domElement.offsetWidth / 2
        this.viewHalfY = this.domElement.offsetHeight / 2
      }
    }

    this.onPointerDown = function (event) {
      // if (this.domElement !== document) {
      //   this.domElement.focus()
      // }
      this.domElement.setPointerCapture( event.pointerId );
      this.rotateStart.set(event.clientX, event.clientY)
      this.rotateDelta.set(0, 0)

      this.isRotate = true
      this.mouseDragOn = true
    }

    this.onPointerUp = function (event) {
      this.domElement.releasePointerCapture( event.pointerId );
      this.isRotate = false
      this.rotateDelta.set(0, 0)
      this.mouseDragOn = false
    }

    this.onPointerMove = function (event) {
      if (this.domElement === document) {
        this.pointerX = event.pageX - this.viewHalfX
        this.pointerY = event.pageY - this.viewHalfY
      } else {
        this.pointerX = event.pageX - this.domElement.offsetLeft - this.viewHalfX
        this.pointerY = event.pageY - this.domElement.offsetTop - this.viewHalfY
      }

      if (!this.isRotate) return
      this.rotateEnd.set(event.clientX, event.clientY)
      this.rotateDelta.subVectors(this.rotateEnd, this.rotateStart).multiplyScalar(1)
      this.rotateStart.copy(this.rotateEnd)

      let deltaX = event.movementX * 0.002
      let deltaY = event.movementY * 0.002
      this.rotateDelta.set(deltaX, deltaY)
    }

    this.onKeyDown = function (event) {
      // console.log('keydown: ' + this.name);
      switch (event.code) {
        case 'ArrowUp':
        case 'KeyW':
          this.moveForward = true
          break

        case 'ArrowLeft':
        case 'KeyA':
          this.moveLeft = true
          break

        case 'ArrowDown':
        case 'KeyS':
          this.moveBackward = true
          break

        case 'ArrowRight':
        case 'KeyD':
          this.moveRight = true
          break

        case 'KeyR':
          this.moveUp = true
          break
        case 'KeyF':
          this.moveDown = true
          break

        case 'Digit1':
        case 'Numpad1':
          this.speedTier = 1
          break
        case 'Digit2':
        case 'Numpad2':
          this.speedTier = 2
          break
        case 'Digit3':
        case 'Numpad3':
          this.speedTier = 3
          break
        case 'Digit4':
        case 'Numpad4':
          this.speedTier = 4
          break
        case 'Digit5':
        case 'Numpad5':
          this.speedTier = 5
          break

        case 'ShiftLeft':
        case 'ShiftRight':
          this.sprint = true
          break
      }
    }

    this.onKeyUp = function (event) {
      switch (event.code) {
        case 'ArrowUp':
        case 'KeyW':
          this.moveForward = false
          break

        case 'ArrowLeft':
        case 'KeyA':
          this.moveLeft = false
          break

        case 'ArrowDown':
        case 'KeyS':
          this.moveBackward = false
          break

        case 'ArrowRight':
        case 'KeyD':
          this.moveRight = false
          break

        case 'KeyR':
          this.moveUp = false
          break
        case 'KeyF':
          this.moveDown = false
          break

        case 'ShiftLeft':
        case 'ShiftRight':
          this.sprint = false
          break
      }
    }

    // Composed multiplier applied on top of `movementSpeed` each frame.
    // Exposed so external input sources (mobile joystick in LccViewer)
    // can pick up the same value.
    this.effectiveSpeedMultiplier = function () {
      const tier = this.speedTiers[this.speedTier - 1] ?? 1
      const sprint = this.sprint ? this.sprintFactor : 1
      return tier * sprint
    }

    this.lookAt = function (x, y, z) {
      if (x.isVector3) {
        _target.copy(x)
      } else {
        _target.set(x, y, z)
      }

      this.object.lookAt(_target)

      setOrientation(this)

      return this
    }

    this.update = (function () {
      return function update(delta) {
        if (this.enabled === false) return
        if (this.heightSpeed) {
          const y = MathUtils.clamp(this.object.position.y, this.heightMin, this.heightMax)
          const heightDelta = y - this.heightMin

          this.autoSpeedFactor = delta * (heightDelta * this.heightCoef)
        } else {
          this.autoSpeedFactor = 0.0
        }

        const actualMoveSpeed = delta * this.movementSpeed * this.effectiveSpeedMultiplier()

        if (this.horizontalLock) {
          // Derive world-space forward/right from the camera orientation,
          // project onto the XZ plane, re-normalise. This way WASD only
          // translates along the ground plane regardless of pitch — looking
          // down at the floor while pressing W no longer flies through it.
          _forward.set(0, 0, -1).applyQuaternion(this.object.quaternion)
          _forward.y = 0
          if (_forward.lengthSq() > 1e-6) _forward.normalize()
          _right.set(1, 0, 0).applyQuaternion(this.object.quaternion)
          _right.y = 0
          if (_right.lengthSq() > 1e-6) _right.normalize()

          if (this.moveForward || (this.autoForward && !this.moveBackward)) {
            this.object.position.addScaledVector(
              _forward,
              actualMoveSpeed + this.autoSpeedFactor,
            )
          }
          if (this.moveBackward) this.object.position.addScaledVector(_forward, -actualMoveSpeed)
          if (this.moveLeft) this.object.position.addScaledVector(_right, -actualMoveSpeed)
          if (this.moveRight) this.object.position.addScaledVector(_right, actualMoveSpeed)
        } else {
          // Legacy free-fly: forward = camera's local -Z, so pitch affects height.
          if (this.moveForward || (this.autoForward && !this.moveBackward)) {
            this.object.translateZ(-(actualMoveSpeed + this.autoSpeedFactor))
          }
          if (this.moveBackward) this.object.translateZ(actualMoveSpeed)

          if (this.moveLeft) this.object.translateX(-actualMoveSpeed)
          if (this.moveRight) this.object.translateX(actualMoveSpeed)
        }

        // R/F always do an explicit world-Y shift so the user can still
        // adjust height deliberately even in horizontalLock mode.
        if (this.moveUp) this.object.translateY(actualMoveSpeed)
        if (this.moveDown) this.object.translateY(-actualMoveSpeed)

        if (!this.isRotate) return

        let quat1 = new Quaternion().setFromAxisAngle(this.object.up, -this.rotateDelta.x)
        let quat2 = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), -this.rotateDelta.y)
        this.object.quaternion.premultiply(quat1)
        this.object.quaternion.multiply(quat2)
        this.rotateDelta.set(0, 0)
      }
    })()

    this.dispose = function () {
      this.domElement.removeEventListener('contextmenu', contextmenu)
      this.domElement.removeEventListener('pointerdown', _onPointerDown)
      this.domElement.removeEventListener('pointermove', _onPointerMove)
      this.domElement.removeEventListener('pointerup', _onPointerUp)

      window.removeEventListener('keydown', _onKeyDown)
      window.removeEventListener('keyup', _onKeyUp)
    }

    const _onPointerMove = this.onPointerMove.bind(this)
    const _onPointerDown = this.onPointerDown.bind(this)
    const _onPointerUp = this.onPointerUp.bind(this)
    const _onKeyDown = this.onKeyDown.bind(this)
    const _onKeyUp = this.onKeyUp.bind(this)

    this.domElement.addEventListener('contextmenu', contextmenu)
    this.domElement.addEventListener('pointerdown', _onPointerDown)
    this.domElement.addEventListener('pointermove', _onPointerMove)
    this.domElement.addEventListener('pointerup', _onPointerUp)

    window.addEventListener('keydown', _onKeyDown)
    window.addEventListener('keyup', _onKeyUp)

    function setOrientation(controls) {
      const quaternion = controls.object.quaternion

      _lookDirection.set(0, 0, -1).applyQuaternion(quaternion)
      _spherical.setFromVector3(_lookDirection)

      lat = 90 - MathUtils.radToDeg(_spherical.phi)
      lon = MathUtils.radToDeg(_spherical.theta)
    }

    this.handleResize()

    setOrientation(this)
  }
}

function contextmenu(event) {
  event.preventDefault()
}

export { FirstPersonControls }
