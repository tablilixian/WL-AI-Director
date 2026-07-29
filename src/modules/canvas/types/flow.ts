export type FlowPhase = 'select' | 'analyze' | 'deduce' | 'storyboard' | 'video' | 'done';

export interface AspectOption {
  key: string;
  label: string;
  defaultLabel: string;
  defaultQuestion: string;
}

export const DEFAULT_ASPECTS: AspectOption[] = [
  { key: 'subject', label: '主体/角色', defaultLabel: '主体', defaultQuestion: '画面中的主要角色或视觉主体是什么？' },
  { key: 'style', label: '风格/质感', defaultLabel: '风格', defaultQuestion: '画面的视觉风格、美术风格？' },
  { key: 'composition', label: '构图', defaultLabel: '构图', defaultQuestion: '镜头构图方式、主体位置？' },
  { key: 'lighting', label: '光影', defaultLabel: '光影', defaultQuestion: '光源方向、光线质感、色调？' },
  { key: 'colorPalette', label: '色彩', defaultLabel: '色彩', defaultQuestion: '整体色彩倾向、饱和度、色温？' },
  { key: 'environment', label: '环境', defaultLabel: '环境', defaultQuestion: '场景环境、空间背景？' },
  { key: 'cameraMovement', label: '镜头运动', defaultLabel: '镜头运动', defaultQuestion: '镜头是否运动？推拉摇移跟？' },
  { key: 'mood', label: '情感氛围', defaultLabel: '氛围', defaultQuestion: '画面传达的情绪、氛围？' },
  { key: 'depth', label: '景深层次', defaultLabel: '景深', defaultQuestion: '前景、中景、背景的层次关系？' },
  { key: 'props', label: '道具细节', defaultLabel: '道具', defaultQuestion: '画面中出现的关键道具？' },
];

export interface VlmAnalysisData {
  rawOutput: string;
  editedAnalysis: string;
  schema: Record<string, string>;
  customSystemPrompt: string;
  customUserPrompt: string;
  selectedAspects: string[];
  retryCount: number;
}

export interface StoryboardPanelData {
  index: number;
  checked: boolean;
  shotSize: string;
  cameraAngle: string;
  subjectPosition: string;
  action: string;
  lighting: string;
  dialogue: string;
  transitionToNext: string;
  rawDescription: string;
}

export interface DeductionData {
  narrativeDirection: string;
  panels: StoryboardPanelData[];
}

export interface StoryboardResultData {
  compositeImageUrl: string;
  splitImages: { gridIndex: number; src: string }[];
}

export interface KeyframePromptData {
  gridIndex: number;
  imageUrl: string;
  visualPrompt: string;
  cameraMovement: string;
  sceneTransition: string;
  action: string;
  dialogue: string;
  timingStart: number;
  timingEnd: number;
}

export interface VideoResultData {
  keyframePrompts: KeyframePromptData[];
  videoUrl?: string;
  thumbnailUrl?: string;
  duration: number;
  fps: number;
}

export interface FlowState {
  phase: FlowPhase;
  sourceLayerId: string | null;
  vlmAnalysis: VlmAnalysisData | null;
  deduction: DeductionData | null;
  storyboard: StoryboardResultData | null;
  video: VideoResultData | null;
}

export const INITIAL_FLOW_STATE: FlowState = {
  phase: 'select',
  sourceLayerId: null,
  vlmAnalysis: null,
  deduction: null,
  storyboard: null,
  video: null,
};

export function getGridTimings(frameCount: number, totalDuration: number) {
  const seg = totalDuration / frameCount;
  return Array.from({ length: frameCount }, (_, i) => ({
    index: i,
    start: +(seg * i).toFixed(1),
    end: +(seg * (i + 1)).toFixed(1),
  }));
}
