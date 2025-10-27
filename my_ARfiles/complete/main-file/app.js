import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { ARButton } from '../../libs/ARButton.js';
import { LoadingBar } from '../../libs/LoadingBar.js';

const style = document.createElement("style");
style.textContent = `
  body > button {
    display: none !important;
  }
`;
document.head.appendChild(style);

class App {
	constructor() {

		const container = document.createElement('div');
		document.body.appendChild(container);

		this.loadingBar = new LoadingBar();
		this.loadingBar.visible = false;

		this.assetsPath = '../../assets/ar-shop/';

		this.camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.01, 20);
		this.camera.position.set(0, 1.6, 0);

		this.scene = new THREE.Scene();

		const ambient = new THREE.HemisphereLight(0xffffff, 0xbbbbff, 1);
		ambient.position.set(0.5, 1, 0.25);
		this.scene.add(ambient);

		this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
		this.renderer.setPixelRatio(window.devicePixelRatio);
		this.renderer.setSize(window.innerWidth, window.innerHeight);
		this.renderer.outputEncoding = THREE.sRGBEncoding;
		container.appendChild(this.renderer.domElement);
		this.setEnvironment();

		this.reticle = new THREE.Mesh(
			new THREE.RingGeometry(0.15, 0.2, 32).rotateX(-Math.PI / 2),
			new THREE.MeshBasicMaterial()
		);

		this.reticle.matrixAutoUpdate = false;
		this.reticle.visible = false;
		this.scene.add(this.reticle);

		this.setupXR();
		window.addEventListener('resize', this.resize.bind(this));

		// Initialize AR button (after renderer is ready)
		new ARButton(this.renderer, {
			sessionInit: { requiredFeatures: ['hit-test'] },
			onSessionStart: () => console.log("AR started"),
			onSessionEnd: () => console.log("AR ended")
		});
	}

	// 🟢 Spatial Awareness Warning
	showSafetyWarning(onConfirm) {
		// Remove any existing overlay
		const existing = document.getElementById('ar-safety-overlay');
		if (existing) existing.remove();

		const overlay = document.createElement('div');
		overlay.id = 'ar-safety-overlay';
		Object.assign(overlay.style, {
			position: 'fixed',
			top: '0',
			left: '0',
			width: '100vw',
			height: '100vh',
			backgroundColor: 'rgba(0, 0, 0, 0.85)',
			display: 'flex',
			flexDirection: 'column',
			alignItems: 'center',
			justifyContent: 'center',
			zIndex: '99999',
			color: '#fff',
			textAlign: 'center',
			padding: '20px',
			fontFamily: 'Arial, sans-serif'
		});

		const title = document.createElement('h2');
		title.textContent = 'Spatial Awareness Warning';
		title.style.color = '#ffcc00';
		title.style.marginBottom = '15px';

		const msg1 = document.createElement('p');
		msg1.textContent = 'Please ensure you have adequate space and lighting around you.';
		msg1.style.margin = '10px 0';

		const msg2 = document.createElement('p');
		msg2.textContent = 'Be aware of your surroundings while using AR.';
		msg2.style.margin = '10px 0';

		const confirmBtn = document.createElement('button');
		confirmBtn.textContent = 'I Understand';
		Object.assign(confirmBtn.style, {
			marginTop: '25px',
			padding: '12px 25px',
			border: 'none',
			borderRadius: '6px',
			background: '#28a745',
			color: '#fff',
			fontSize: '16px',
			cursor: 'pointer',
			transition: 'background 0.3s'
		});
		confirmBtn.onmouseenter = () => (confirmBtn.style.background = '#218838');
		confirmBtn.onmouseleave = () => (confirmBtn.style.background = '#28a745');
		confirmBtn.onclick = () => {
			overlay.remove();
			onConfirm();
		};

		overlay.append(title, msg1, msg2, confirmBtn);
		document.body.appendChild(overlay);
	}

	setupXR() {
		this.renderer.xr.enabled = true;

		if ('xr' in navigator) {
			navigator.xr.isSessionSupported('immersive-ar').then((supported) => {
				if (supported) {
					const collection = document.getElementsByClassName("ar-button");
					[...collection].forEach(el => el.style.display = 'block');
				}
			});
		}

		const self = this;
		this.hitTestSourceRequested = false;
		this.hitTestSource = null;

		function onSelect() {
			if (self.chair === undefined) return;
			if (self.reticle.visible) {
				self.chair.position.setFromMatrixPosition(self.reticle.matrix);
				self.chair.visible = true;
			}
		}

		this.controller = this.renderer.xr.getController(0);
		this.controller.addEventListener('select', onSelect);
		this.scene.add(this.controller);
	}

	resize() {
		this.camera.aspect = window.innerWidth / window.innerHeight;
		this.camera.updateProjectionMatrix();
		this.renderer.setSize(window.innerWidth, window.innerHeight);
	}

	setEnvironment() {
		const loader = new RGBELoader().setPath('../../assets/');
		loader.load('hdr/venice_sunset_1k.hdr', (texture) => {
			texture.mapping = THREE.EquirectangularReflectionMapping;
			this.scene.environment = texture;
		});
	}

	showChair(id) {
		// Show spatial warning before initiating AR
		this.showSafetyWarning(() => this.initAR(id));
	}

	initAR(id) {
		let currentSession = null;
		const self = this;
		const sessionInit = { requiredFeatures: ['hit-test'] };

		function onSessionStarted(session) {
			session.addEventListener('end', onSessionEnded);
			self.renderer.xr.setReferenceSpaceType('local');
			self.renderer.xr.setSession(session);
			currentSession = session;

			if (id !== undefined) self.loadChair(id);
		}

		function onSessionEnded() {
			currentSession.removeEventListener('end', onSessionEnded);
			currentSession = null;
			if (self.chair !== null) {
				self.scene.remove(self.chair);
				self.chair = null;
			}
			self.renderer.setAnimationLoop(null);
		}

		if (currentSession === null) {
			navigator.xr.requestSession('immersive-ar', sessionInit).then(onSessionStarted);
		} else {
			currentSession.end();
		}
	}

	loadChair(id) {
		const loader = new GLTFLoader().setPath(this.assetsPath);
		this.loadingBar.visible = true;
		const self = this;

		loader.load(
			`chair${id}.glb`,
			function (gltf) {
				self.scene.add(gltf.scene);
				self.chair = gltf.scene;
				self.chair.visible = false;
				self.loadingBar.visible = false;
				self.renderer.setAnimationLoop(self.render.bind(self));
			},
			function (xhr) {
				self.loadingBar.progress = (xhr.loaded / xhr.total);
			},
			function (error) {
				console.log('An error happened', error);
			}
		);
	}

	requestHitTestSource() {
		const self = this;
		const session = this.renderer.xr.getSession();

		session.requestReferenceSpace('viewer').then(function (referenceSpace) {
			session.requestHitTestSource({ space: referenceSpace }).then(function (source) {
				self.hitTestSource = source;
			});
		});

		session.addEventListener('end', function () {
			self.hitTestSourceRequested = false;
			self.hitTestSource = null;
			self.referenceSpace = null;
		});

		this.hitTestSourceRequested = true;
	}

	getHitTestResults(frame) {
		const hitTestResults = frame.getHitTestResults(this.hitTestSource);
		if (hitTestResults.length) {
			const referenceSpace = this.renderer.xr.getReferenceSpace();
			const hit = hitTestResults[0];
			const pose = hit.getPose(referenceSpace);
			this.reticle.visible = true;
			this.reticle.matrix.fromArray(pose.transform.matrix);
		} else {
			this.reticle.visible = false;
		}
	}

	render(timestamp, frame) {
		if (frame) {
			if (this.hitTestSourceRequested === false) this.requestHitTestSource();
			if (this.hitTestSource) this.getHitTestResults(frame);
		}
		this.renderer.render(this.scene, this.camera);
	}
}

export { App };


