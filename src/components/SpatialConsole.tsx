import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { Container, Root, Text } from '@react-three/uikit';
import { useXR, useXRInputSourceState } from '@react-three/xr';
import { Formula, FormulaGeometryMode, PRESET_FORMULAS, ShaderPreset } from '../constants';
import { PRESET_SHADERS } from '../shaders';
import {
  GEOMETRY_MODES,
  DEFAULT_XR_VISUAL_TRANSFORM,
  GraphGeometrySelection,
  GraphGeometrySelectionSetter,
  XRVisualTransform,
  XRVisualTransformSetter,
  XR_VISUAL_DISTANCE_MAX,
  XR_VISUAL_DISTANCE_MIN,
  XR_VISUAL_SCALE_MAX,
  XR_VISUAL_SCALE_MIN
} from '../lib/xrTypes';

// In-XR control console built on @react-three/uikit. Replaces the hand-rolled
// box/troika HUD: crisp MSDF text (bundled as data URIs — no network fetch to
// fail on visionOS), flexbox layout, and hover/press feedback. All actions
// fire on pointer-down: with gaze-and-pinch input the gaze drifts between
// pinch-down and pinch-up, which eats press+release clicks.

const ACCENT = '#818cf8';
const ACCENT_STRONG = '#6366f1';
const PANEL_BG = '#0b0e1a';
const ROW_BG = '#161b2e';
const ROW_HOVER = '#232a45';
const OK = '#34d399';
const WARN = '#f59e0b';
const DANGER = '#ef4444';
const TEXT_DIM = '#8b93b8';

const formatQuant = (q: number) => (q >= 0 ? `${q + 1}x` : `1/${Math.abs(q) + 1}x`);

function ConsoleButton({
  label,
  onTap,
  tone = 'default',
  grow,
  width,
  fontSize = 13
}: {
  label: string;
  onTap?: () => void;
  tone?: 'default' | 'accent' | 'ok' | 'warn' | 'danger';
  grow?: boolean;
  width?: number;
  fontSize?: number;
}) {
  const background =
    tone === 'accent' ? ACCENT_STRONG : tone === 'ok' ? '#065f46' : tone === 'warn' ? '#92400e' : tone === 'danger' ? '#7f1d1d' : ROW_BG;
  return (
    <Container
      flexGrow={grow ? 1 : undefined}
      width={width}
      height={34}
      borderRadius={8}
      backgroundColor={background}
      hover={{ backgroundColor: tone === 'default' ? ROW_HOVER : '#3d478a' }}
      justifyContent="center"
      alignItems="center"
      onPointerDown={(e: any) => {
        e.stopPropagation?.();
        onTap?.();
      }}
    >
      <Text fontSize={fontSize} fontWeight="medium" color="#f4f6ff">
        {label}
      </Text>
    </Container>
  );
}

function ConsoleToggle({ label, value, onTap }: { label: string; value: boolean; onTap: () => void }) {
  return (
    <Container
      flexGrow={1}
      height={34}
      borderRadius={8}
      backgroundColor={value ? '#123f31' : ROW_BG}
      hover={{ backgroundColor: value ? '#175243' : ROW_HOVER }}
      flexDirection="row"
      justifyContent="space-between"
      alignItems="center"
      paddingX={10}
      onPointerDown={(e: any) => {
        e.stopPropagation?.();
        onTap();
      }}
    >
      <Text fontSize={12} color="#e7eaff">{label}</Text>
      <Text fontSize={12} fontWeight="bold" color={value ? OK : TEXT_DIM}>{value ? 'ON' : 'OFF'}</Text>
    </Container>
  );
}

function Stepper({
  label,
  value,
  onDec,
  onInc
}: {
  label: string;
  value: string;
  onDec: () => void;
  onInc: () => void;
}) {
  return (
    <Container flexDirection="row" gap={6} alignItems="center">
      <ConsoleButton label="−" width={40} onTap={onDec} />
      <Container flexGrow={1} height={34} borderRadius={8} backgroundColor="#080b14" justifyContent="center" alignItems="center" flexDirection="column">
        <Text fontSize={10} color={TEXT_DIM}>{label}</Text>
        <Text fontSize={12} fontWeight="bold" color="#ffffff">{value}</Text>
      </Container>
      <ConsoleButton label="+" width={40} onTap={onInc} />
    </Container>
  );
}

type ConsoleTab = 'music' | 'notes' | 'control' | 'settings' | 'view' | 'pilot' | 'formulas' | 'shaders';

export interface SpatialConsoleProps {
  onNextFormula?: () => void;
  onNextShader?: () => void;
  isPlaying: boolean;
  onTogglePlay?: () => void;
  formula: Formula;
  shader: ShaderPreset;
  currentGeometryMode: FormulaGeometryMode;
  xrGeometrySelection: GraphGeometrySelection;
  setXrGeometrySelection?: GraphGeometrySelectionSetter;
  xrVisualTransform: XRVisualTransform;
  setXrVisualTransform?: XRVisualTransformSetter;
  onResetXRViewer?: () => void;
  show3D: boolean;
  setShow3D?: (show: boolean) => void;
  showWireframe: boolean;
  setShowWireframe?: (show: boolean) => void;
  showArtifacts: boolean;
  setShowArtifacts?: (show: boolean) => void;
  speed: number;
  setSpeed?: (speed: number) => void;
  onSelectFormula?: (formula: Formula) => void;
  onSelectShader?: (shader: ShaderPreset) => void;
  audioSync: boolean;
  setAudioSync?: (sync: boolean) => void;
  autoCycleFormula: boolean;
  setAutoCycleFormula?: (auto: boolean) => void;
  autoCycleShader: boolean;
  setAutoCycleShader?: (auto: boolean) => void;
  speedQuant: number;
  setSpeedQuant?: (q: number) => void;
  formulaQuant: number;
  setFormulaQuant?: (q: number) => void;
  shaderQuant: number;
  setShaderQuant?: (q: number) => void;
  formulaCycleSpeed: number;
  setFormulaCycleSpeed?: (s: number) => void;
  shaderCycleSpeed: number;
  setShaderCycleSpeed?: (s: number) => void;
  preview?: boolean;
  // Music tab (the XR default while a MIDI session is live).
  midiActive?: boolean;
  midiName?: string | null;
  musicPlaying?: boolean;
  onToggleMusic?: () => void;
  onSeekMusic?: (deltaSeconds: number) => void;
  getMusicTime?: () => { time: number; duration: number };
  onCycleLibrary?: (offset: number) => void;
  libraryName?: string | null;
  noteFxAmount?: number;
  setNoteFxAmount?: (amount: number) => void;
  noteFxMode?: 'both' | 'morph' | 'pulse' | 'off';
  setNoteFxMode?: (mode: 'both' | 'morph' | 'pulse' | 'off') => void;
  noteSpread?: number;
  setNoteSpread?: (spread: number) => void;
  noteMeshes?: boolean;
  setNoteMeshes?: (on: boolean) => void;
  xrHaptics?: boolean;
  setXrHaptics?: (on: boolean) => void;
  // Note-visuals options (NOTES tab).
  noteSource?: 'formula' | 'mesh';
  setNoteSource?: (source: 'formula' | 'mesh') => void;
  meshUseMtl?: boolean;
  setMeshUseMtl?: (on: boolean) => void;
  meshAssign?: 'random' | 'channel';
  setMeshAssign?: (mode: 'random' | 'channel') => void;
  meshChannelMap?: string[];
  setMeshChannelMap?: (map: string[]) => void;
  noteDisplay?: 'sounding' | 'all';
  setNoteDisplay?: (mode: 'sounding' | 'all') => void;
  meshLibrary?: string[];
}

const PAGE_SIZE = 6;

export default function SpatialConsole(props: SpatialConsoleProps) {
  const session = useXR((state) => state.session);
  const leftController = useXRInputSourceState('controller', 'left');
  const rightController = useXRInputSourceState('controller', 'right');
  const hasControllers = Boolean(leftController || rightController);
  const hudScale = hasControllers ? 1 : 1.3;

  const [activeTab, setActiveTab] = useState<ConsoleTab>(props.midiActive ? 'music' : 'control');
  const [formulaPage, setFormulaPage] = useState(0);
  const [shaderPage, setShaderPage] = useState(0);
  const [musicTimeLabel, setMusicTimeLabel] = useState('0:00 / 0:00');

  // Low-rate clock readout for the music tab (uikit re-renders on state).
  useEffect(() => {
    if (!props.midiActive || !props.getMusicTime || activeTab !== 'music') return;
    const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
    const id = window.setInterval(() => {
      const t = props.getMusicTime!();
      setMusicTimeLabel(`${fmt(t.time)} / ${fmt(Number.isFinite(t.duration) ? t.duration : 0)}`);
    }, 500);
    return () => window.clearInterval(id);
  }, [props.midiActive, props.getMusicTime, activeTab]);
  const [hudPosition, setHudPosition] = useState<[number, number, number]>([-1.12, 1.24, -1.18]);
  const [isDragging, setIsDragging] = useState(false);
  const groupRef = useRef<THREE.Group>(null);
  const dragOffset = useRef(new THREE.Vector3());

  const { preview } = props;
  const visible = !!session || !!preview;
  if (!visible) return null;

  const setTransform = (updater: (prev: XRVisualTransform) => XRVisualTransform) => props.setXrVisualTransform?.(updater);
  const cycleGeometry = (offset: number) => {
    props.setXrGeometrySelection?.((prev) => {
      const selections: GraphGeometrySelection[] = ['formula', ...GEOMETRY_MODES];
      const index = selections.indexOf(prev);
      return selections[(index + offset + selections.length) % selections.length];
    });
  };

  const handleGrabDown = (e: any) => {
    e.stopPropagation?.();
    if (!groupRef.current || !e.point) return;
    dragOffset.current.copy(groupRef.current.position).sub(e.point);
    setIsDragging(true);
    e.target?.setPointerCapture?.(e.pointerId);
  };
  const handleGrabMove = (e: any) => {
    if (!isDragging || !e.point) return;
    e.stopPropagation?.();
    const next = e.point.clone().add(dragOffset.current);
    setHudPosition([
      THREE.MathUtils.clamp(next.x, -1.95, 1.95),
      THREE.MathUtils.clamp(next.y, 0.9, 1.85),
      THREE.MathUtils.clamp(next.z, -1.9, -0.65)
    ]);
  };
  const handleGrabUp = (e: any) => {
    if (!isDragging) return;
    e.stopPropagation?.();
    setIsDragging(false);
    e.target?.releasePointerCapture?.(e.pointerId);
  };

  const geometryLabel = props.xrGeometrySelection === 'formula'
    ? (props.formula.parametric ? 'SURFACE (P,Q)' : `AUTO: ${props.currentGeometryMode.toUpperCase()}`)
    : props.currentGeometryMode.toUpperCase();

  const formulaPages = Math.max(1, Math.ceil(PRESET_FORMULAS.length / PAGE_SIZE));
  const shaderPages = Math.max(1, Math.ceil(PRESET_SHADERS.length / PAGE_SIZE));

  // Audio-first ordering: the music flow leads; the silent-studio pickers
  // (formulas/shaders) close the row.
  const tabs: Array<{ key: ConsoleTab; label: string }> = [
    { key: 'music', label: 'MUSIC' },
    { key: 'notes', label: 'NOTES' },
    { key: 'control', label: 'CTRL' },
    { key: 'pilot', label: 'PILOT' },
    { key: 'view', label: 'VIEW' },
    { key: 'settings', label: 'SETUP' },
    { key: 'formulas', label: 'FORMS' },
    { key: 'shaders', label: 'SHADERS' }
  ];

  const cycleChannelMesh = (channel: number, offset: number) => {
    const library = props.meshLibrary ?? [];
    if (!library.length || !props.setMeshChannelMap || !props.meshChannelMap) return;
    const index = Math.max(0, library.indexOf(props.meshChannelMap[channel]));
    const map = [...props.meshChannelMap];
    map[channel] = library[(index + offset + library.length) % library.length];
    props.setMeshChannelMap(map);
  };

  const groupPosition: [number, number, number] = session ? hudPosition : [0, 0, 12];
  const groupScale = session ? hudScale : 9;
  const groupRotation: [number, number, number] = session ? [-Math.PI / 28, Math.PI / 5, 0] : [0, 0, 0];

  const helpLine = hasControllers
    ? 'STICK MOVES YOU · TRIGGER-DRAG MOVES THE VISUAL · TWO TRIGGERS SCALE & TURN'
    : 'ONE PINCH DRAGS THE VISUAL · TWO-HAND PINCH SCALES & TURNS · DRAG TOP BAR TO MOVE PANEL';

  return (
    <group
      ref={groupRef}
      position={groupPosition}
      rotation={groupRotation}
      scale={[groupScale, groupScale, groupScale]}
      onPointerMove={handleGrabMove}
      onPointerUp={handleGrabUp}
      onPointerCancel={handleGrabUp}
    >
      <Root
        pixelSize={0.00165}
        flexDirection="column"
        backgroundColor={PANEL_BG}
        borderRadius={18}
        padding={14}
        gap={10}
        width={520}
      >
        {/* Grab bar */}
        <Container
          height={22}
          borderRadius={11}
          backgroundColor={isDragging ? '#14b8a6' : '#1d2440'}
          hover={{ backgroundColor: '#2b3560' }}
          justifyContent="center"
          alignItems="center"
          onPointerDown={handleGrabDown}
        >
          <Text fontSize={10} color={isDragging ? '#022c26' : TEXT_DIM} fontWeight="bold">
            HARMONIC.OS SPATIAL CONSOLE — DRAG ME
          </Text>
        </Container>

        {/* Tabs */}
        <Container flexDirection="row" gap={6}>
          {tabs.map((tab) => (
            <Container
              key={tab.key}
              flexGrow={1}
              height={30}
              borderRadius={8}
              backgroundColor={activeTab === tab.key ? ACCENT_STRONG : ROW_BG}
              hover={{ backgroundColor: activeTab === tab.key ? ACCENT_STRONG : ROW_HOVER }}
              justifyContent="center"
              alignItems="center"
              onPointerDown={(e: any) => {
                e.stopPropagation?.();
                setActiveTab(tab.key);
              }}
            >
              <Text fontSize={10.5} fontWeight="bold" color={activeTab === tab.key ? '#ffffff' : TEXT_DIM}>
                {tab.label}
              </Text>
            </Container>
          ))}
        </Container>

        {/* MUSIC — transport, pieces, and the note dials */}
        {activeTab === 'music' && (
          <Container flexDirection="column" gap={8}>
            <Container flexDirection="column" gap={2} backgroundColor="#080b14" borderRadius={10} padding={10}>
              <Text fontSize={10.5} color={TEXT_DIM}>NOW PLAYING</Text>
              <Text fontSize={13.5} fontWeight="bold" color="#ffffff">
                {(props.libraryName ?? props.midiName ?? 'No score loaded — pick a piece').slice(0, 46)}
              </Text>
              <Text fontSize={11} color={ACCENT}>{props.midiActive ? musicTimeLabel : 'Load from the piece buttons below'}</Text>
            </Container>
            <Container flexDirection="row" gap={8}>
              <ConsoleButton grow label="⏴ 10s" onTap={() => props.onSeekMusic?.(-10)} />
              <ConsoleButton
                grow
                tone={props.musicPlaying ? 'warn' : 'ok'}
                label={props.musicPlaying ? '❚❚ PAUSE' : '▶ PLAY'}
                onTap={props.onToggleMusic}
              />
              <ConsoleButton grow label="10s ⏵" onTap={() => props.onSeekMusic?.(10)} />
            </Container>
            <Container flexDirection="row" gap={8}>
              <ConsoleButton grow tone="accent" label="◀ PIECE" onTap={() => props.onCycleLibrary?.(-1)} />
              <ConsoleButton grow tone="accent" label="PIECE ▶" onTap={() => props.onCycleLibrary?.(1)} />
            </Container>
            <Container flexDirection="row" gap={8}>
              <ConsoleToggle
                label="BEAT HAPTICS"
                value={!!props.xrHaptics}
                onTap={() => props.setXrHaptics?.(!props.xrHaptics)}
              />
            </Container>
            <Container height={18} justifyContent="center" alignItems="center">
              <Text fontSize={9.5} color={TEXT_DIM}>A = PLAY / PAUSE · X / Y = PREVIOUS / NEXT PIECE</Text>
            </Container>
          </Container>
        )}

        {/* NOTES — how each note renders and moves */}
        {activeTab === 'notes' && (
          <Container flexDirection="column" gap={8}>
            <Stepper
              label="NOTE FX"
              value={`${Math.round((props.noteFxAmount ?? 2) * 100)}%`}
              onDec={() => props.setNoteFxAmount?.(Math.max(0, (props.noteFxAmount ?? 2) - 0.25))}
              onInc={() => props.setNoteFxAmount?.(Math.min(8, (props.noteFxAmount ?? 2) + 0.25))}
            />
            <Container flexDirection="row" gap={6}>
              {(['both', 'morph', 'pulse', 'off'] as const).map((mode) => (
                <ConsoleButton
                  key={mode}
                  grow
                  fontSize={10.5}
                  tone={props.noteFxMode === mode ? 'accent' : 'default'}
                  label={mode.toUpperCase()}
                  onTap={() => props.setNoteFxMode?.(mode)}
                />
              ))}
            </Container>
            <Stepper
              label="NOTE SPREAD"
              value={`${(props.noteSpread ?? 5).toFixed(1)}x`}
              onDec={() => props.setNoteSpread?.(Math.max(0.5, (props.noteSpread ?? 5) - 0.5))}
              onInc={() => props.setNoteSpread?.(Math.min(10, (props.noteSpread ?? 5) + 0.5))}
            />
            <Container flexDirection="row" gap={8}>
              <ConsoleToggle
                label="CONSTELLATION"
                value={!!props.noteMeshes}
                onTap={() => props.setNoteMeshes?.(!props.noteMeshes)}
              />
            </Container>
            <Container flexDirection="row" gap={6}>
              <ConsoleButton
                grow
                fontSize={10.5}
                tone={props.noteSource !== 'mesh' ? 'accent' : 'default'}
                label="FORMULAS"
                onTap={() => props.setNoteSource?.('formula')}
              />
              <ConsoleButton
                grow
                fontSize={10.5}
                tone={props.noteSource === 'mesh' ? 'accent' : 'default'}
                label="3D MESHES"
                onTap={() => props.setNoteSource?.('mesh')}
              />
            </Container>
            {props.noteSource === 'mesh' && (
              <>
                <Container flexDirection="row" gap={6}>
                  <ConsoleButton
                    grow
                    fontSize={10.5}
                    tone={!props.meshUseMtl ? 'accent' : 'default'}
                    label="APP MATERIALS"
                    onTap={() => props.setMeshUseMtl?.(false)}
                  />
                  <ConsoleButton
                    grow
                    fontSize={10.5}
                    tone={props.meshUseMtl ? 'accent' : 'default'}
                    label="MTL COLORS"
                    onTap={() => props.setMeshUseMtl?.(true)}
                  />
                </Container>
                <Container flexDirection="row" gap={6}>
                  <ConsoleButton
                    grow
                    fontSize={10.5}
                    tone={props.meshAssign === 'random' ? 'accent' : 'default'}
                    label="RANDOM"
                    onTap={() => props.setMeshAssign?.('random')}
                  />
                  <ConsoleButton
                    grow
                    fontSize={10.5}
                    tone={props.meshAssign === 'channel' ? 'accent' : 'default'}
                    label="PER CHANNEL"
                    onTap={() => props.setMeshAssign?.('channel')}
                  />
                </Container>
                {props.meshAssign === 'channel' && (props.meshChannelMap ?? []).map((meshName, channel) => (
                  <Stepper
                    key={channel}
                    label={`CH ${channel + 1} MESH`}
                    value={meshName}
                    onDec={() => cycleChannelMesh(channel, -1)}
                    onInc={() => cycleChannelMesh(channel, 1)}
                  />
                ))}
              </>
            )}
            <Container flexDirection="row" gap={6}>
              <ConsoleButton
                grow
                fontSize={10.5}
                tone={props.noteDisplay !== 'all' ? 'accent' : 'default'}
                label="SOUNDING ONLY"
                onTap={() => props.setNoteDisplay?.('sounding')}
              />
              <ConsoleButton
                grow
                fontSize={10.5}
                tone={props.noteDisplay === 'all' ? 'accent' : 'default'}
                label="ALL NOTES"
                onTap={() => props.setNoteDisplay?.('all')}
              />
            </Container>
          </Container>
        )}

        {/* CONTROL */}
        {activeTab === 'control' && (
          <Container flexDirection="column" gap={8}>
            <Container flexDirection="column" gap={2} backgroundColor="#080b14" borderRadius={10} padding={10}>
              <Text fontSize={11} color={TEXT_DIM}>FORMULA</Text>
              <Text fontSize={15} fontWeight="bold" color="#ffffff">{props.formula.name}</Text>
              <Text fontSize={11} color={ACCENT}>{props.shader.name}</Text>
            </Container>
            <Container flexDirection="row" gap={8}>
              <ConsoleButton grow tone={props.isPlaying ? 'warn' : 'ok'} label={props.isPlaying ? '❚❚ PAUSE' : '▶ PLAY'} onTap={props.onTogglePlay} />
              <ConsoleButton grow tone="accent" label="FORMULA ▶" onTap={props.onNextFormula} />
              <ConsoleButton grow tone="accent" label="SHADER ▶" onTap={props.onNextShader} />
            </Container>
            <Container flexDirection="row" gap={8}>
              <ConsoleButton grow tone="danger" label="EXIT IMMERSIVE" onTap={() => session?.end()} />
            </Container>
          </Container>
        )}

        {/* SETTINGS */}
        {activeTab === 'settings' && (
          <Container flexDirection="column" gap={8}>
            <Container flexDirection="row" gap={8}>
              <ConsoleToggle label="3D VOLUME" value={props.show3D} onTap={() => props.setShow3D?.(!props.show3D)} />
              <ConsoleToggle label="WIREFRAME" value={props.showWireframe} onTap={() => props.setShowWireframe?.(!props.showWireframe)} />
            </Container>
            <Container flexDirection="row" gap={8}>
              <ConsoleToggle label="GUIDE AXES" value={props.showArtifacts} onTap={() => props.setShowArtifacts?.(!props.showArtifacts)} />
              <ConsoleToggle label="BEAT SYNC" value={props.audioSync} onTap={() => props.setAudioSync?.(!props.audioSync)} />
            </Container>
            <Stepper
              label="ANIMATION SPEED"
              value={`${props.speed.toFixed(1)}x`}
              onDec={() => props.setSpeed?.(Math.max(0.1, props.speed - 0.5))}
              onInc={() => props.setSpeed?.(Math.min(5, props.speed + 0.5))}
            />
          </Container>
        )}

        {/* VIEW */}
        {activeTab === 'view' && (
          <Container flexDirection="column" gap={8}>
            <Stepper
              label="SIZE"
              value={`${Math.round((props.xrVisualTransform.scale / DEFAULT_XR_VISUAL_TRANSFORM.scale) * 100)}%`}
              onDec={() => setTransform((prev) => ({ ...prev, scale: THREE.MathUtils.clamp(prev.scale - 0.012, XR_VISUAL_SCALE_MIN, XR_VISUAL_SCALE_MAX) }))}
              onInc={() => setTransform((prev) => ({ ...prev, scale: THREE.MathUtils.clamp(prev.scale + 0.012, XR_VISUAL_SCALE_MIN, XR_VISUAL_SCALE_MAX) }))}
            />
            <Stepper
              label="DISTANCE"
              value={`${props.xrVisualTransform.distance.toFixed(2)}m`}
              onDec={() => setTransform((prev) => ({ ...prev, distance: THREE.MathUtils.clamp(prev.distance - 0.15, XR_VISUAL_DISTANCE_MIN, XR_VISUAL_DISTANCE_MAX) }))}
              onInc={() => setTransform((prev) => ({ ...prev, distance: THREE.MathUtils.clamp(prev.distance + 0.15, XR_VISUAL_DISTANCE_MIN, XR_VISUAL_DISTANCE_MAX) }))}
            />
            <Stepper
              label="YAW"
              value={`${Math.round(THREE.MathUtils.radToDeg(props.xrVisualTransform.yaw))}°`}
              onDec={() => setTransform((prev) => ({ ...prev, yaw: prev.yaw - THREE.MathUtils.degToRad(15) }))}
              onInc={() => setTransform((prev) => ({ ...prev, yaw: prev.yaw + THREE.MathUtils.degToRad(15) }))}
            />
            <Stepper
              label={`GEOMETRY · ${geometryLabel}`}
              value={props.xrGeometrySelection === 'formula' ? 'AUTO' : 'MANUAL'}
              onDec={() => cycleGeometry(-1)}
              onInc={() => cycleGeometry(1)}
            />
            <Container flexDirection="row" gap={8}>
              <ConsoleToggle
                label="AUTO-ROTATE"
                value={props.xrVisualTransform.autoRotate}
                onTap={() => setTransform((prev) => ({ ...prev, autoRotate: !prev.autoRotate }))}
              />
              <ConsoleButton
                grow
                tone="warn"
                label="RESET ALL"
                onTap={() => {
                  setTransform(() => DEFAULT_XR_VISUAL_TRANSFORM);
                  props.onResetXRViewer?.();
                }}
              />
            </Container>
          </Container>
        )}

        {/* PILOT */}
        {activeTab === 'pilot' && (
          <Container flexDirection="column" gap={8}>
            <ConsoleToggle label="AUDIO BEAT SYNC (MIC)" value={props.audioSync} onTap={() => props.setAudioSync?.(!props.audioSync)} />
            <Stepper
              label={props.audioSync ? 'TEMPO QUANT' : 'SPEED'}
              value={props.audioSync ? formatQuant(props.speedQuant) : `${props.speed.toFixed(1)}x`}
              onDec={() => (props.audioSync ? props.setSpeedQuant?.(Math.max(-10, props.speedQuant - 1)) : props.setSpeed?.(Math.max(0.1, props.speed - 0.5)))}
              onInc={() => (props.audioSync ? props.setSpeedQuant?.(Math.min(10, props.speedQuant + 1)) : props.setSpeed?.(Math.min(5, props.speed + 0.5)))}
            />
            <Container flexDirection="row" gap={8}>
              <ConsoleToggle label="AUTO FORMULA" value={props.autoCycleFormula} onTap={() => props.setAutoCycleFormula?.(!props.autoCycleFormula)} />
              <ConsoleToggle label="AUTO SHADER" value={props.autoCycleShader} onTap={() => props.setAutoCycleShader?.(!props.autoCycleShader)} />
            </Container>
            <Stepper
              label={props.audioSync ? 'FORMULA BEAT' : 'FORMULA INTERVAL'}
              value={props.audioSync ? formatQuant(props.formulaQuant) : `${props.formulaCycleSpeed.toFixed(1)}s`}
              onDec={() => (props.audioSync ? props.setFormulaQuant?.(Math.max(-10, props.formulaQuant - 1)) : props.setFormulaCycleSpeed?.(Math.max(0.5, props.formulaCycleSpeed - 0.5)))}
              onInc={() => (props.audioSync ? props.setFormulaQuant?.(Math.min(10, props.formulaQuant + 1)) : props.setFormulaCycleSpeed?.(Math.min(10, props.formulaCycleSpeed + 0.5)))}
            />
            <Stepper
              label={props.audioSync ? 'SHADER BEAT' : 'SHADER INTERVAL'}
              value={props.audioSync ? formatQuant(props.shaderQuant) : `${props.shaderCycleSpeed.toFixed(1)}s`}
              onDec={() => (props.audioSync ? props.setShaderQuant?.(Math.max(-10, props.shaderQuant - 1)) : props.setShaderCycleSpeed?.(Math.max(0.5, props.shaderCycleSpeed - 0.5)))}
              onInc={() => (props.audioSync ? props.setShaderQuant?.(Math.min(10, props.shaderQuant + 1)) : props.setShaderCycleSpeed?.(Math.min(10, props.shaderCycleSpeed + 0.5)))}
            />
          </Container>
        )}

        {/* FORMULAS */}
        {activeTab === 'formulas' && (
          <PresetPager
            items={PRESET_FORMULAS}
            page={formulaPage}
            pages={formulaPages}
            setPage={setFormulaPage}
            activeId={props.formula.id}
            onSelect={(item) => props.onSelectFormula?.(item as Formula)}
          />
        )}

        {/* SHADERS */}
        {activeTab === 'shaders' && (
          <PresetPager
            items={PRESET_SHADERS}
            page={shaderPage}
            pages={shaderPages}
            setPage={setShaderPage}
            activeId={props.shader.id}
            onSelect={(item) => props.onSelectShader?.(item as ShaderPreset)}
          />
        )}

        <Container height={18} justifyContent="center" alignItems="center">
          <Text fontSize={8.5} color={TEXT_DIM}>{helpLine}</Text>
        </Container>
      </Root>
    </group>
  );
}

function PresetPager({
  items,
  page,
  pages,
  setPage,
  activeId,
  onSelect
}: {
  items: Array<{ id: string; name: string; category?: string }>;
  page: number;
  pages: number;
  setPage: (updater: (page: number) => number) => void;
  activeId: string;
  onSelect: (item: { id: string; name: string }) => void;
}) {
  const pageItems = useMemo(() => items.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE), [items, page]);

  return (
    <Container flexDirection="column" gap={6}>
      {pageItems.map((item) => (
        <Container
          key={item.id}
          height={32}
          borderRadius={8}
          backgroundColor={item.id === activeId ? ACCENT_STRONG : ROW_BG}
          hover={{ backgroundColor: item.id === activeId ? ACCENT_STRONG : ROW_HOVER }}
          flexDirection="row"
          alignItems="center"
          justifyContent="space-between"
          paddingX={10}
          onPointerDown={(e: any) => {
            e.stopPropagation?.();
            onSelect(item);
          }}
        >
          <Text fontSize={12} fontWeight={item.id === activeId ? 'bold' : 'medium'} color="#f4f6ff">
            {item.name.length > 34 ? `${item.name.slice(0, 33)}…` : item.name}
          </Text>
          <Text fontSize={9} color={item.id === activeId ? '#c7d2fe' : TEXT_DIM}>
            {(item.category ?? 'Core').slice(0, 14)}
          </Text>
        </Container>
      ))}
      <Container flexDirection="row" gap={8} alignItems="center">
        <ConsoleButton width={110} label="◀ PREV" onTap={() => setPage((p) => Math.max(0, p - 1))} />
        <Container flexGrow={1} justifyContent="center" alignItems="center">
          <Text fontSize={11} color={TEXT_DIM}>{`PAGE ${page + 1} / ${pages}`}</Text>
        </Container>
        <ConsoleButton width={110} label="NEXT ▶" onTap={() => setPage((p) => Math.min(pages - 1, p + 1))} />
      </Container>
    </Container>
  );
}
