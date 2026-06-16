export interface NovelFileInfo {
  id: string;
  fileName: string;
  fileType: 'txt' | 'epub';
  fileSize: number;
  uploadTime: number;
}

export interface NovelChapter {
  index: number;
  title: string;
  summary: string;
  content: string;
  keyEvents: string[];
}

export interface NovelCharacter {
  id: string;
  name: string;
  aliases: string[];
  gender: string;
  age: string;
  personality: string;
  background: string;
  appearance: string;
  visualPrompt?: string;
  role: 'protagonist' | 'antagonist' | 'supporting' | 'minor';
  relationships: {
    targetId: string;
    relation: string;
    description: string;
  }[];
  firstAppearance: number;
  relevance: number;
}

export interface NovelScene {
  id: string;
  name: string;
  description: string;
  chapterIndex: number;
  characters: string[];
  significance: string;
}

export interface NovelItem {
  id: string;
  name: string;
  category: string;
  description: string;
  significance: string;
  ownerCharacterId?: string;
  chapters: number[];
}

export interface WorldSetting {
  id: string;
  name: string;
  category: 'magic_system' | 'political' | 'geography' | 'history' | 'culture' | 'technology' | 'other';
  description: string;
  details: string;
  relatedChapters: number[];
}

export interface NovelAnalysis {
  id: string;
  projectId: string;

  fileInfo: NovelFileInfo;
  rawText: string;

  title: string;
  author?: string;
  genre: string;
  summary: string;

  chapters: NovelChapter[];
  characters: NovelCharacter[];
  keyScenes: NovelScene[];
  keyItems: NovelItem[];
  worldSettings: WorldSetting[];

  status: 'uploaded' | 'analyzing' | 'completed' | 'failed';
  analysisModel?: string;
  adaptations?: ScriptAdaptation[];
  createdAt: number;
  updatedAt: number;
}

export interface ScriptAdaptation {
  id: string;
  novelAnalysisId: string;
  sourceChapters: number[];
  sourceScenes: string[];
  adaptationStrategy: string;

  scriptData: {
    title: string;
    genre: string;
    logline: string;
    characters: {
      name: string;
      gender: string;
      age: string;
      personality: string;
      visualPrompt?: string;
    }[];
    scenes: {
      location: string;
      time: string;
      atmosphere: string;
    }[];
    storyParagraphs: { text: string; sceneRefId: string }[];
  };

  createdAt: number;
}
