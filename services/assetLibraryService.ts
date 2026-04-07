import { AssetLibraryItem, Character, ProjectState, Prop, Scene } from '../types';
import type { LayerData } from '../src/modules/canvas/types/canvas';

/**
 * 生成统一的 UUID（本地和云端共用）
 * 避免本地 ID 和云端 ID 不一致导致的重复问题
 */
const generateId = (): string => {
  // 使用浏览器原生 UUID API
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // 降级方案（旧浏览器）
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
};

const cloneCharacterVariation = (variation: Character['variations'][number]): Character['variations'][number] => ({
  ...variation,
  id: generateId(),
  status: variation.imageUrl ? 'completed' : 'pending'
});

export const createLibraryItemFromTurnaround = (
  character: Character,
  project?: Pick<ProjectState, 'id' | 'title'>
): AssetLibraryItem => {
  const now = Date.now();
  
  // 创建一个简化的角色对象，只包含九宫格图片信息
  const turnaroundCharacter: Character = {
    id: generateId(),
    name: character.name,
    gender: character.gender,
    age: character.age,
    personality: character.personality,
    visualPrompt: character.visualPrompt,
    negativePrompt: character.negativePrompt,
    coreFeatures: character.coreFeatures,
    imageUrl: character.turnaround?.imageUrl,
    turnaround: character.turnaround,
    variations: [],
    status: 'completed'
  };

  return {
    id: generateId(),
    type: 'turnaround',
    name: `${character.name} - 九宫格造型`,
    projectId: project?.id,
    projectName: project?.title,
    createdAt: now,
    updatedAt: now,
    data: turnaroundCharacter
  };
};

export const createLibraryItemFromCharacter = (
  character: Character,
  project?: Pick<ProjectState, 'id' | 'title'>
): AssetLibraryItem => {
  const now = Date.now();
  return {
    id: generateId(),
    type: 'character',
    name: character.name,
    projectId: project?.id,
    projectName: project?.title,
    createdAt: now,
    updatedAt: now,
    data: {
      ...character,
      variations: (character.variations || []).map((v) => ({ ...v }))
    }
  };
};

export const createLibraryItemFromScene = (
  scene: Scene,
  project?: Pick<ProjectState, 'id' | 'title'>
): AssetLibraryItem => {
  const now = Date.now();
  return {
    id: generateId(),
    type: 'scene',
    name: scene.location,
    projectId: project?.id,
    projectName: project?.title,
    createdAt: now,
    updatedAt: now,
    data: { ...scene }
  };
};

export const cloneCharacterForProject = (character: Character): Character => {
  return {
    ...character,
    id: generateId(),
    variations: (character.variations || []).map(cloneCharacterVariation),
    status: character.imageUrl ? 'completed' : 'pending'
  };
};

export const cloneSceneForProject = (scene: Scene): Scene => {
  return {
    ...scene,
    id: generateId(),
    status: scene.imageUrl ? 'completed' : 'pending'
  };
};

export const createLibraryItemFromProp = (
  prop: Prop,
  project?: Pick<ProjectState, 'id' | 'title'>
): AssetLibraryItem => {
  const now = Date.now();
  return {
    id: generateId(),
    type: 'prop',
    name: prop.name,
    projectId: project?.id,
    projectName: project?.title,
    createdAt: now,
    updatedAt: now,
    data: { ...prop }
  };
};

export const clonePropForProject = (prop: Prop): Prop => {
  return {
    ...prop,
    id: generateId(),
    status: prop.imageUrl ? 'completed' : 'pending'
  };
};

export const applyLibraryItemToProject = (project: ProjectState, item: AssetLibraryItem): ProjectState => {
  if (!project.scriptData) {
    throw new Error('项目尚未生成角色和场景，无法导入资产。');
  }

  const newData = { ...project.scriptData };

  if (item.type === 'character') {
    const character = cloneCharacterForProject(item.data as Character);
    newData.characters = [...newData.characters, character];
  } else if (item.type === 'scene') {
    const scene = cloneSceneForProject(item.data as Scene);
    newData.scenes = [...newData.scenes, scene];
  } else if (item.type === 'prop') {
    const prop = clonePropForProject(item.data as Prop);
    newData.props = [...(newData.props || []), prop];
  } else if (item.type === 'turnaround') {
    const turnaroundChar = item.data as Character;
    const existingChar = newData.characters.find(c => c.name === turnaroundChar.name);
    if (existingChar) {
      existingChar.turnaround = turnaroundChar.turnaround;
    } else {
      const newChar = cloneCharacterForProject(turnaroundChar);
      newChar.turnaround = turnaroundChar.turnaround;
      newData.characters = [...newData.characters, newChar];
    }
  }

  return {
    ...project,
    scriptData: newData
  };
};

/**
 * 从画布图层创建资产库项
 * 智能识别图层来源，保存完整的角色/场景数据或创建新资产
 * 
 * @param layer - 画布图层数据
 * @param project - 当前项目状态
 * @param assetType - 目标资产类型（当无法从图层识别时使用）
 * @param customName - 自定义资产名称（可选）
 * @returns 资产库项
 */
export const createLibraryItemFromLayer = async (
  layer: LayerData,
  project: ProjectState,
  assetType: 'character' | 'scene' | 'prop',
  customName?: string
): Promise<AssetLibraryItem> => {
  // 优先尝试从图层关联的资源 ID 获取完整的角色/场景数据
  // 这样能保存完整的结构化数据（如角色设定、场景描述等），而不仅仅是一张图片
  if (layer.linkedResourceId && layer.linkedResourceType !== 'keyframe') {
    if (layer.linkedResourceType === 'character') {
      const character = project.scriptData?.characters.find(c => c.id === layer.linkedResourceId);
      if (character) {
        console.log('[AssetLibrary] 从图层关联的角色创建资产库项:', character.name);
        return createLibraryItemFromCharacter(character, project);
      }
    } else if (layer.linkedResourceType === 'scene') {
      const scene = project.scriptData?.scenes.find(s => s.id === layer.linkedResourceId);
      if (scene) {
        console.log('[AssetLibrary] 从图层关联的场景创建资产库项:', scene.location);
        return createLibraryItemFromScene(scene, project);
      }
    }
  }
  
  // 如果图层没有关联资源 ID 或关联的是关键帧，则从图层图片创建新资产
  // 这种情况适用于：AI 生成的图片、导入的本地图片等
  const imageUrl = layer.src;
  
  console.log('[AssetLibrary] 从图层图片创建新资产，类型:', assetType, '图层标题:', layer.title);
  
  if (assetType === 'character') {
    // 创建新的角色资产
    const character: Character = {
      id: generateId(),
      name: customName || layer.title || '新角色',
      gender: 'unknown',
      age: 'unknown',
      personality: '',
      visualPrompt: '',
      negativePrompt: '',
      coreFeatures: '',
      imageUrl,
      turnaround: undefined,
      variations: [],
      status: 'completed'
    };
    return createLibraryItemFromCharacter(character, project);
  } else if (assetType === 'scene') {
    // 创建新的场景资产
    const scene: Scene = {
      id: generateId(),
      location: customName || layer.title || '新场景',
      time: '',
      atmosphere: '',
      visualPrompt: '',
      negativePrompt: '',
      imageUrl,
      status: 'completed'
    };
    return createLibraryItemFromScene(scene, project);
  } else {
    // 创建新的道具资产
    const prop: Prop = {
      id: generateId(),
      name: customName || layer.title || '新道具',
      category: 'general',
      description: '',
      visualPrompt: '',
      negativePrompt: '',
      imageUrl,
      status: 'completed'
    };
    return createLibraryItemFromProp(prop, project);
  }
};
