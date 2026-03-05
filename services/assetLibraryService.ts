import { AssetLibraryItem, Character, ProjectState, Prop, Scene, CharacterTurnaroundData } from '../types';

const generateId = (prefix: string): string => {
  const rand = Math.random().toString(36).slice(2, 6);
  return `${prefix}-${Date.now().toString(36)}-${rand}`;
};

const cloneCharacterVariation = (variation: Character['variations'][number]): Character['variations'][number] => ({
  ...variation,
  id: generateId('var'),
  status: variation.referenceImage ? 'completed' : 'pending'
});

export const createLibraryItemFromTurnaround = (
  character: Character,
  project?: Pick<ProjectState, 'id' | 'title'>
): AssetLibraryItem => {
  const now = Date.now();
  
  // 创建一个简化的角色对象，只包含九宫格图片信息
  const turnaroundCharacter: Character = {
    id: generateId('char'),
    name: character.name,
    gender: character.gender,
    age: character.age,
    personality: character.personality,
    visualPrompt: character.visualPrompt,
    negativePrompt: character.negativePrompt,
    coreFeatures: character.coreFeatures,
    // 使用九宫格图片作为参考图
    referenceImage: character.turnaround?.imageUrl,
    referenceImageSource: character.turnaround?.imageUrlSource,
    localImageId: character.turnaround?.localImageId,
    // 保存九宫格数据
    turnaround: character.turnaround,
    variations: [],
    status: 'completed'
  };

  return {
    id: generateId('asset'),
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
    id: generateId('asset'),
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
    id: generateId('asset'),
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
    id: generateId('char'),
    variations: (character.variations || []).map(cloneCharacterVariation),
    status: character.referenceImage ? 'completed' : 'pending'
  };
};

export const cloneSceneForProject = (scene: Scene): Scene => {
  return {
    ...scene,
    id: generateId('scene'),
    status: scene.referenceImage ? 'completed' : 'pending'
  };
};

export const createLibraryItemFromProp = (
  prop: Prop,
  project?: Pick<ProjectState, 'id' | 'title'>
): AssetLibraryItem => {
  const now = Date.now();
  return {
    id: generateId('asset'),
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
    id: generateId('prop'),
    status: prop.referenceImage ? 'completed' : 'pending'
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
