import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// ==========================================
// 💡 블렌더 세팅값 하드코딩
// ==========================================
const TARGET_ASPECT = 1170 / 2532;
const BLENDER_ORTHO_SCALE = 1.510;

const scene = new THREE.Scene();

// HTML에 있는 기존 캔버스 요소를 가져옵니다.
const canvas = document.getElementById('webgl-canvas'); 

// WebGLRenderer에 canvas 옵션을 지정해 줍니다.
const renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: false });
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); 

let camera;

// ==========================================
// 🎬 애니메이션 & 상호작용 상태 변수
// ==========================================
const clock = new THREE.Clock();
let mixer;
let shipAction;    // 배 애니메이션
let storageAction; // 스토리지(Armature) 애니메이션
let cube43Action;  // 버튼(Cube011_3) 애니메이션
let yoAction;      // 텍스트(yo) 애니메이션

let armature002Action; // storage003 또는 Cube008_1용
let armature001Action; // Cube041_2 또는 storage007용
let armature003Action; // Cube039_1 또는 Cube039_2용
let armature004Action; // Cube043_1 또는 Cube043_3용

let facAction;         // fac 애니메이션 추가
let textAction;        // 💡 text 애니메이션 상태 변수 추가
let facTimeout = null; // fac 애니메이션 연타 방지용 타이머
let isFacPlaying = false; // 💡 fac 애니메이션 재생 상태 (클릭 차단용)

let isYoForward = true; // yo 애니메이션 방향 토글

// 색상 토글 상태와 5개의 쉐이더 설정값
let isColorToggled = false; 

// ==========================================
// 💡 HTML UI 패널 요소 가져오기 및 이벤트 바인딩
// ==========================================
const minrakPanel = document.getElementById('ui-panel-minrak');
const summaryPanel = document.getElementById('ui-panel-summary');
const closeBtns = document.querySelectorAll('.close-button');

let uiTimeout = null;      // 민락항 패널 출력용 타이머
let summaryTimeout = null; // 요약 패널 출력용 타이머

// 모든 닫기 버튼에 이벤트 리스너 등록
closeBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
        // 클릭된 버튼이 속한 가장 가까운 패널을 찾아 숨김 처리
        const panel = e.target.closest('.ui-panel');
        if (panel) {
            panel.classList.add('hidden');

            // 💡 [핵심] 요약 패널 닫기를 누르면 Cube011_3 클릭과 똑같이 작동하도록 설정
            if (panel.id === 'ui-panel-summary') {
                if (yoAction && yoAction.timeScale > 0) { // 현재 정방향 끝에 위치해 있다면
                    yoAction.paused = false;
                    yoAction.timeScale = -1; // 역방향으로 전환
                    yoAction.play();
                    
                    isYoForward = true; // 다음 큐브 클릭을 위해 다시 정방향 대기 상태로 변경
                }
                
                // 버튼 쑥 들어가는 애니메이션도 재생
                if (cube43Action && !cube43Action.isRunning()) {
                    cube43Action.reset().play();
                }

                // 색상을 원래 파란색으로 복구
                isColorToggled = false;
            }
        }
        
        // 닫기 버튼 누르면 예약된 패널 타이머 모두 초기화
        if (uiTimeout) {
            clearTimeout(uiTimeout);
            uiTimeout = null;
        }
        if (summaryTimeout) {
            clearTimeout(summaryTimeout);
            summaryTimeout = null;
        }
    });
});

// 블렌더의 Emission(발광) 쉐이더 색상 데이터
const emissionColors = [
    { name: 'sea',      mat: null, base: new THREE.Color('#57B5C5'), target: new THREE.Color('#000000') },
    { name: 'blue',     mat: null, base: new THREE.Color('#417DDA'), target: new THREE.Color('#317238') },
    { name: 'blue_er',  mat: null, base: new THREE.Color('#5C8CEF'), target: new THREE.Color('#4A9A51') },
    { name: 'blue_est', mat: null, base: new THREE.Color('#8EB5FF'), target: new THREE.Color('#71BB6A') },
    { name: 'letter',   mat: null, base: new THREE.Color('#3F3F3F'), target: new THREE.Color('#C7C9CC') }
];

// 여러 개의 lightpath를 관리하기 위한 통합 객체
const dynamicLights = {
    'lightpath_1': { mat: null, base: new THREE.Color(), target: new THREE.Color(), highlight: new THREE.Color('#FFEC77'), timeout: null },
    'lightpath_2': { mat: null, base: new THREE.Color(), target: new THREE.Color(), highlight: new THREE.Color('#FFEC77'), timeout: null },
    'lightpath_3': { mat: null, base: new THREE.Color(), target: new THREE.Color(), highlight: new THREE.Color('#FFEC77'), timeout: null },
    'lightpath_4': { mat: null, base: new THREE.Color(), target: new THREE.Color(), highlight: new THREE.Color('#FFEC77'), timeout: null }
};

// 특정 조명을 1초간 발광시키는 공통 함수
function triggerLight(lightName) {
    const light = dynamicLights[lightName];
    if (light && light.mat) {
        light.target.copy(light.highlight); // 노란색으로 타겟 변경
        
        if (light.timeout) clearTimeout(light.timeout); // 연타 방지
        light.timeout = setTimeout(() => {
            light.target.copy(light.base); // 1초 뒤 원래 색으로 복구
        }, 1000);
    }
}

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
let clickStartPos = { x: 0, y: 0 }; 

// ==========================================
// 🎮 줌 & 패닝 상태 변수
// ==========================================
let zoomLevel = 1;          
const MAX_ZOOM = 4;        
let panOffset = { x: 0, y: 0 }; 

let baseRenderWidth = 0;   
let baseRenderHeight = 0;  

// ==========================================
// 📷 카메라 뷰 업데이트 함수
// ==========================================
function updateCameraView() {
    if (!camera || !camera.isOrthographicCamera) return;

    const zoomedWidth = baseRenderWidth / zoomLevel;
    const zoomedHeight = baseRenderHeight / zoomLevel;

    const maxPanX = Math.max(0, (baseRenderWidth - zoomedWidth) / 2);
    const maxPanY = Math.max(0, (baseRenderHeight - zoomedHeight) / 2);

    panOffset.x = THREE.MathUtils.clamp(panOffset.x, -maxPanX, maxPanX);
    panOffset.y = THREE.MathUtils.clamp(panOffset.y, -maxPanY, maxPanY);

    camera.left = -zoomedWidth / 2 + panOffset.x;
    camera.right = zoomedWidth / 2 + panOffset.x;
    camera.top = zoomedHeight / 2 + panOffset.y;
    camera.bottom = -zoomedHeight / 2 + panOffset.y;
    
    camera.updateProjectionMatrix();
}

function calculateBaseBounds() {
    const width = window.innerWidth;
    const height = window.innerHeight;
    const screenAspect = width / height;
    
    renderer.setSize(width, height);

    const baseWidth = BLENDER_ORTHO_SCALE; 
    const baseHeight = BLENDER_ORTHO_SCALE / TARGET_ASPECT;

    if (screenAspect > TARGET_ASPECT) {
        baseRenderWidth = baseWidth;
        baseRenderHeight = baseWidth / screenAspect;
    } else {
        baseRenderHeight = baseHeight;
        baseRenderWidth = baseHeight * screenAspect;
    }

    updateCameraView();
}

window.addEventListener('resize', calculateBaseBounds);

// ==========================================
// 🎯 실질적인 클릭 감지 및 애니메이션 트리거 함수
// ==========================================
function checkIntersection(clientX, clientY) {
    if (!camera || !mixer) return;

    // 💡 fac 애니메이션이 재생 중이면 클릭 이벤트 무시
    if (isFacPlaying) {
        console.log("🔒 fac 애니메이션 재생 중... 클릭 차단됨");
        return; 
    }

    pointer.x = (clientX / window.innerWidth) * 2 - 1;
    pointer.y = -(clientY / window.innerHeight) * 2 + 1;

    raycaster.setFromCamera(pointer, camera);
    const intersects = raycaster.intersectObjects(scene.children, true);

    if (intersects.length > 0) {
        const shipTargets = ['Cylinder025', 'Cylinder025_1', 'Cylinder_025', 'Cylinder_025_1'];
        const storageTargets = ['storage001', 'Cube004', 'storage_2']; 
        const cubeTargets = ['Cube011_3'];
        
        const arm001Targets = ['storage003', 'Cube008_1','Cube008'];
        const arm003Targets = ['Cube041_2', 'storage007','Cube041_1'];
        const arm002Targets = ['Cube039_1', 'Cube039_2','Cube039'];
        const arm004Targets = ['Cube043_1', 'Cube043_3','Cube043_2'];

        const hit = intersects.find(i => 
            shipTargets.includes(i.object.name) || 
            storageTargets.includes(i.object.name) ||
            cubeTargets.includes(i.object.name) ||
            arm002Targets.includes(i.object.name) ||
            arm001Targets.includes(i.object.name) ||
            arm003Targets.includes(i.object.name) ||
            arm004Targets.includes(i.object.name) 
        );

        if (hit) {
            // 연타 및 다른 요소 클릭 시 예약된 타이머 취소
            if (uiTimeout) clearTimeout(uiTimeout);
            if (summaryTimeout) clearTimeout(summaryTimeout);

            if (shipTargets.includes(hit.object.name)) {
                console.log(`🎯 배 클릭! 이름: ${hit.object.name}`);
                if (shipAction) {
                    shipAction.reset().play();
                }
            } 
            // 1. 오리지널 스토리지 타겟 클릭
            else if (storageTargets.includes(hit.object.name)) {
                console.log(`🎯 스토리지 클릭! 이름: ${hit.object.name}`);
                if (storageAction) {
                    storageAction.reset().play();
                }
                triggerLight('lightpath_3');

                if (minrakPanel) {
                    uiTimeout = setTimeout(() => {
                        minrakPanel.classList.remove('hidden'); 
                    }, 1200); 
                }
            }
            // 2. 버튼 큐브 클릭
            else if (cubeTargets.includes(hit.object.name)) {
                console.log(`🎯 버튼 큐브 클릭!`);
                
                // 닫기 버튼 대신 3D 큐브를 직접 클릭하여 되돌리려 할 때 패널 닫기 보장
                if (summaryPanel && !summaryPanel.classList.contains('hidden')) {
                    summaryPanel.classList.add('hidden');
                }

                if (cube43Action && !cube43Action.isRunning()) {
                    cube43Action.reset().play();
                }
                
                if (yoAction) {
                    yoAction.paused = false; 
                    yoAction.timeScale = isYoForward ? 1 : -1; 
                    yoAction.play(); 
                    
                    isYoForward = !isYoForward; 
                }
                isColorToggled = !isColorToggled;
            }
            // 3. Arm002 타겟 클릭
            else if (arm002Targets.includes(hit.object.name)) {
                console.log(`🎯 클릭: ${hit.object.name}`);
                if (armature002Action) {
                    armature002Action.reset().play();
                }
                triggerLight('lightpath_1');

                if (minrakPanel) {
                    uiTimeout = setTimeout(() => {
                        minrakPanel.classList.remove('hidden');
                    }, 1200);
                }
            }
            // 4. Arm001 타겟 클릭
            else if (arm001Targets.includes(hit.object.name)) {
                console.log(`🎯 클릭: ${hit.object.name}`);
                if (armature001Action) {
                    armature001Action.reset().play();
                }
                triggerLight('lightpath_4');

                if (minrakPanel) {
                    uiTimeout = setTimeout(() => {
                        minrakPanel.classList.remove('hidden');
                    }, 1200);
                }
            }
            // 5. Arm003 타겟 클릭
            else if (arm003Targets.includes(hit.object.name)) {
                console.log(`🎯 클릭: ${hit.object.name}`);
                if (armature003Action) {
                    armature003Action.reset().play();
                }
                triggerLight('lightpath_2');

                if (minrakPanel) {
                    uiTimeout = setTimeout(() => {
                        minrakPanel.classList.remove('hidden');
                    }, 1200);
                }
            }
            // 6. Arm004 타겟 클릭 
            else if (arm004Targets.includes(hit.object.name)) {
                console.log(`🎯 클릭: ${hit.object.name}`);
                if (armature004Action) {
                    armature004Action.reset().play();
                }

                if (facAction) {
                    if (facTimeout) clearTimeout(facTimeout);
                    
                    facTimeout = setTimeout(() => {
                        isFacPlaying = true; // 💡 재생 시작 시 클릭 차단
                        
                        facAction.reset().play();
                        
                        // 💡 text 애니메이션 동시 재생 추가
                        if (textAction) {
                            textAction.reset().play();
                        }
                        
                        console.log(`🎬 1초 뒤 fac 및 text 애니메이션 실행됨! (클릭 차단됨)`);
                    }, 1000);
                }
            }
        } else {
            console.log("❌ 다른 오브젝트를 클릭했습니다:", intersects[0].object.name);
        }
    } else {
        console.log("🌌 허공을 클릭했습니다.");
    }
}

// ==========================================
// 🖱️ 이벤트 리스너 관리 (.ui-panel 로 변경)
// ==========================================
let isDragging = false;
let previousPointer = { x: 0, y: 0 };
let previousPinchDistance = null;

// 1. 마우스 이벤트
window.addEventListener('mousedown', (e) => {
    if (e.target.closest('.ui-panel')) return; // 패널 위에서는 이벤트 무시
    isDragging = true;
    previousPointer = { x: e.clientX, y: e.clientY };
    clickStartPos = { x: e.clientX, y: e.clientY };
});

window.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    applyPanDelta(e.clientX - previousPointer.x, e.clientY - previousPointer.y);
    previousPointer = { x: e.clientX, y: e.clientY };
});

window.addEventListener('mouseup', (e) => {
    isDragging = false;
    if (e.target.closest('.ui-panel')) return;

    const dist = Math.hypot(e.clientX - clickStartPos.x, e.clientY - clickStartPos.y);
    if (dist < 5) checkIntersection(e.clientX, e.clientY);
});
window.addEventListener('mouseleave', () => isDragging = false);

// 2. 휠 이벤트 (패널 스크롤 시 카메라 줌 방지)
window.addEventListener('wheel', (e) => {
    if (e.target.closest('.ui-panel')) return;
    const zoomSpeed = 0.002;
    zoomLevel -= e.deltaY * zoomSpeed;
    zoomLevel = THREE.MathUtils.clamp(zoomLevel, 1, MAX_ZOOM);
    updateCameraView();
}, { passive: false });

// 3. 모바일 터치 이벤트
window.addEventListener('touchstart', (e) => {
    if (e.target.closest('.ui-panel')) return;

    if (e.touches.length === 1) {
        isDragging = true;
        previousPointer = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        clickStartPos = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    } else if (e.touches.length === 2) {
        isDragging = false;
        previousPinchDistance = Math.hypot(
            e.touches[0].clientX - e.touches[1].clientX,
            e.touches[0].clientY - e.touches[1].clientY
        );
    }
}, { passive: false });

window.addEventListener('touchmove', (e) => {
    if (e.target.closest('.ui-panel')) return;
    e.preventDefault(); 
    
    if (isDragging && e.touches.length === 1) {
        applyPanDelta(e.touches[0].clientX - previousPointer.x, e.touches[0].clientY - previousPointer.y);
        previousPointer = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    } 
    else if (e.touches.length === 2 && previousPinchDistance) {
        const currentDistance = Math.hypot(
            e.touches[0].clientX - e.touches[1].clientX,
            e.touches[0].clientY - e.touches[1].clientY
        );
        const distanceDelta = currentDistance - previousPinchDistance;
        zoomLevel += distanceDelta * 0.01;
        zoomLevel = THREE.MathUtils.clamp(zoomLevel, 1, MAX_ZOOM);
        updateCameraView();
        previousPinchDistance = currentDistance;
    }
}, { passive: false });

window.addEventListener('touchend', (e) => {
    isDragging = false;
    previousPinchDistance = null;
    if (e.target.closest('.ui-panel')) return;

    if (e.cancelable) e.preventDefault(); 

    if (e.changedTouches.length === 1) {
        const dist = Math.hypot(e.changedTouches[0].clientX - clickStartPos.x, e.changedTouches[0].clientY - clickStartPos.y);
        if (dist < 15) checkIntersection(e.changedTouches[0].clientX, e.changedTouches[0].clientY);
    }
}, { passive: false });

function applyPanDelta(deltaX, deltaY) {
    const zoomedWidth = baseRenderWidth / zoomLevel;
    const zoomedHeight = baseRenderHeight / zoomLevel;
    panOffset.x -= (deltaX / window.innerWidth) * zoomedWidth;
    panOffset.y += (deltaY / window.innerHeight) * zoomedHeight;
    updateCameraView();
}

// ==========================================
// 🚀 모델 로드 및 애니메이션 초기화
// ==========================================
const loader = new GLTFLoader();
loader.load('/models/netlog_nla_netspa222222.glb', (gltf) => {
    scene.add(gltf.scene);
    console.log("🎬 모델에 포함된 애니메이션 목록:", gltf.animations);
    
    gltf.scene.traverse((child) => {
        if (child.isMesh && child.material) {
            const materials = Array.isArray(child.material) ? child.material : [child.material];
            
            materials.forEach((m) => {
                const pureName = m.name.split('.')[0];
                
                const config = emissionColors.find(c => c.name === pureName);
                if (config) {
                    config.mat = m;
                    config.mat.emissive.copy(config.base);
                }

                if (dynamicLights[pureName]) {
                    dynamicLights[pureName].mat = m;
                    dynamicLights[pureName].base.copy(m.emissive);
                    dynamicLights[pureName].target.copy(m.emissive); 
                }
            });
        }
    });

    if (gltf.cameras && gltf.cameras.length > 0) {
        camera = gltf.cameras[0];
    } else {
        console.error("카메라를 불러오지 못했습니다.");
        return;
    }

    mixer = new THREE.AnimationMixer(gltf.scene);

    // 💡 애니메이션 종료 이벤트 감지
    mixer.addEventListener('finished', (e) => {
        // yoAction이 '정방향(timeScale > 0)'으로 끝까지 재생을 마쳤을 때만 실행
        if (e.action === yoAction && yoAction.timeScale > 0) {
            if (summaryTimeout) clearTimeout(summaryTimeout);
            
            summaryTimeout = setTimeout(() => {
                if (summaryPanel) {
                    summaryPanel.classList.remove('hidden');
                }
            }, 150); // 끝나고 0.15초 뒤에 스르륵 등장
        }

        // 💡 fac 애니메이션 재생 종료 시 클릭 다시 허용 (text 애니메이션과 동시 재생이므로 fac 기준으로 해제 유지)
        if (e.action === facAction) {
            isFacPlaying = false;
            console.log(`✅ fac 및 text 애니메이션 종료! (클릭 활성화됨)`);
        }
    });

    if (gltf.animations && gltf.animations.length > 0) {
        const BLENDER_FPS = 24;

        const shipClip = THREE.AnimationClip.findByName(gltf.animations, 'Empty.002Action'); 
        if (shipClip) {
            const shipSubClip = THREE.AnimationUtils.subclip(shipClip, 'ship_action_1_60', 1, 130, BLENDER_FPS);
            shipAction = mixer.clipAction(shipSubClip);
            shipAction.setLoop(THREE.LoopOnce);
            shipAction.clampWhenFinished = true;
        }

        const storageClip = THREE.AnimationClip.findByName(gltf.animations, 'ArmatureAction');
        if (storageClip) {
            storageAction = mixer.clipAction(storageClip);
            storageAction.setLoop(THREE.LoopOnce);
            storageAction.clampWhenFinished = true;
        }

        const cube43Clip = THREE.AnimationClip.findByName(gltf.animations, 'Cube.043Action');
        if (cube43Clip) {
            cube43Action = mixer.clipAction(cube43Clip);
            cube43Action.setLoop(THREE.LoopOnce);
            cube43Action.clampWhenFinished = true;
        }

        const yoClip = THREE.AnimationClip.findByName(gltf.animations, 'yo');
        if (yoClip) {
            yoAction = mixer.clipAction(yoClip);
            yoAction.setLoop(THREE.LoopOnce);
            yoAction.clampWhenFinished = true;
        }

        const arm002Clip = THREE.AnimationClip.findByName(gltf.animations, 'ArmatureAction.002');
        if (arm002Clip) {
            armature002Action = mixer.clipAction(arm002Clip);
            armature002Action.setLoop(THREE.LoopOnce);
            armature002Action.clampWhenFinished = true;
        }

        const arm001Clip = THREE.AnimationClip.findByName(gltf.animations, 'ArmatureAction.001');
        if (arm001Clip) {
            armature001Action = mixer.clipAction(arm001Clip);
            armature001Action.setLoop(THREE.LoopOnce);
            armature001Action.clampWhenFinished = true;
        }

        const arm003Clip = THREE.AnimationClip.findByName(gltf.animations, 'ArmatureAction.003');
        if (arm003Clip) {
            armature003Action = mixer.clipAction(arm003Clip);
            armature003Action.setLoop(THREE.LoopOnce);
            armature003Action.clampWhenFinished = true;
        }

        const arm004Clip = THREE.AnimationClip.findByName(gltf.animations, 'ArmatureAction.004');
        if (arm004Clip) {
            armature004Action = mixer.clipAction(arm004Clip);
            armature004Action.setLoop(THREE.LoopOnce);
            armature004Action.clampWhenFinished = true;
        }

        const facClip = THREE.AnimationClip.findByName(gltf.animations, 'fac');
        if (facClip) {
            facAction = mixer.clipAction(facClip);
            facAction.setLoop(THREE.LoopOnce);
            facAction.clampWhenFinished = true;
        }

        // 💡 text 애니메이션 클립 추출 및 설정 추가
        const textClip = THREE.AnimationClip.findByName(gltf.animations, 'text');
        if (textClip) {
            textAction = mixer.clipAction(textClip);
            textAction.setLoop(THREE.LoopOnce);
            textAction.clampWhenFinished = true;
        }
    }

    camera.updateMatrixWorld(); 
    calculateBaseBounds(); 
});

// ==========================================
// 렌더링 루프
// ==========================================
function animate() {
    requestAnimationFrame(animate);
    const delta = clock.getDelta();
    
    if (mixer) mixer.update(delta);

    const lerpSpeed = 4.0 * delta; 
    
    emissionColors.forEach(config => {
        if (config.mat) {
            const currentColorTarget = isColorToggled ? config.target : config.base;
            config.mat.emissive.lerp(currentColorTarget, lerpSpeed);
        }
    });

    Object.values(dynamicLights).forEach(light => {
        if (light.mat) {
            light.mat.emissive.lerp(light.target, lerpSpeed);
        }
    });

    if (camera) renderer.render(scene, camera);
}
animate();