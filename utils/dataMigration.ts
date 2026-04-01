import { ProjectState, Character, CharacterVariation, Scene, Prop, CharacterTurnaroundData } from '../types';

/**
 * 数据迁移工具
 * 用于将旧版本的数据格式迁移到新版本
 * 
 * 迁移内容：
 * - Character: referenceImage + referenceImageSource + localImageId -> imageUrl
 * - CharacterVariation: referenceImage -> imageUrl
 * - Scene: referenceImage + referenceImageSource + localImageId -> imageUrl
 * - Prop: referenceImage + referenceImageSource + localImageId -> imageUrl
 * - CharacterTurnaroundData: imageUrlSource + localImageId -> imageUrl
 */

/**
 * 迁移单个角色数据
 */
export const migrateCharacter = (character: Character): Character => {
  const migrated: Character = { ...character };

  const oldCharacter = character as any;
  if (oldCharacter.referenceImage) {
    if (oldCharacter.referenceImageSource === 'local' && oldCharacter.localImageId) {
      migrated.imageUrl = `local:${oldCharacter.localImageId}`;
    } else {
      migrated.imageUrl = oldCharacter.referenceImage;
    }
    delete oldCharacter.referenceImage;
    delete oldCharacter.referenceImageSource;
    delete oldCharacter.localImageId;
  }

  if (character.variations) {
    migrated.variations = character.variations.map(migrateCharacterVariation);
  }

  if (character.turnaround) {
    migrated.turnaround = migrateCharacterTurnaround(character.turnaround);
  }

  return migrated;
};

/**
 * 迁移角色变体数据
 */
export const migrateCharacterVariation = (variation: CharacterVariation): CharacterVariation => {
  const migrated: CharacterVariation = { ...variation };
  const oldVariation = variation as any;

  if (oldVariation.referenceImage) {
    migrated.imageUrl = oldVariation.referenceImage;
    delete oldVariation.referenceImage;
  }

  return migrated;
};

/**
 * 迁移角色九宫格数据
 */
export const migrateCharacterTurnaround = (turnaround: CharacterTurnaroundData): CharacterTurnaroundData => {
  const migrated: CharacterTurnaroundData = { ...turnaround };
  const oldTurnaround = turnaround as any;

  if (oldTurnaround.imageUrlSource === 'local' && oldTurnaround.localImageId) {
    migrated.imageUrl = `local:${oldTurnaround.localImageId}`;
    delete oldTurnaround.imageUrlSource;
    delete oldTurnaround.localImageId;
  }

  return migrated;
};

/**
 * 迁移场景数据
 */
export const migrateScene = (scene: Scene): Scene => {
  const migrated: Scene = { ...scene };
  const oldScene = scene as any;

  if (oldScene.referenceImage) {
    if (oldScene.referenceImageSource === 'local' && oldScene.localImageId) {
      migrated.imageUrl = `local:${oldScene.localImageId}`;
    } else {
      migrated.imageUrl = oldScene.referenceImage;
    }
    delete oldScene.referenceImage;
    delete oldScene.referenceImageSource;
    delete oldScene.localImageId;
  }

  return migrated;
};

/**
 * 迁移道具数据
 */
export const migrateProp = (prop: Prop): Prop => {
  const migrated: Prop = { ...prop };
  const oldProp = prop as any;

  if (oldProp.referenceImage) {
    if (oldProp.referenceImageSource === 'local' && oldProp.localImageId) {
      migrated.imageUrl = `local:${oldProp.localImageId}`;
    } else {
      migrated.imageUrl = oldProp.referenceImage;
    }
    delete oldProp.referenceImage;
    delete oldProp.referenceImageSource;
    delete oldProp.localImageId;
  }

  return migrated;
};

/**
 * 迁移整个项目数据
 */
export const migrateProject = (project: ProjectState): ProjectState => {
  const migrated: ProjectState = { ...project };

  if (project.scriptData) {
    if (project.scriptData.characters) {
      migrated.scriptData = {
        ...project.scriptData,
        characters: project.scriptData.characters.map(migrateCharacter)
      };
    }

    if (project.scriptData.scenes) {
      migrated.scriptData = {
        ...migrated.scriptData!,
        scenes: project.scriptData.scenes.map(migrateScene)
      };
    }

    if (project.scriptData.props) {
      migrated.scriptData = {
        ...migrated.scriptData!,
        props: project.scriptData.props.map(migrateProp)
      };
    }
  }

  return migrated;
};

/**
 * 检查项目数据是否需要迁移
 */
export const needsMigration = (project: ProjectState): boolean => {
  if (!project.scriptData) return false;

  const hasOldCharacterFields = project.scriptData.characters?.some(
    (c: any) => c.referenceImage || c.referenceImageSource || c.localImageId
  );

  const hasOldVariationFields = project.scriptData.characters?.some(
    (c: Character) => c.variations?.some((v: any) => v.referenceImage)
  );

  const hasOldSceneFields = project.scriptData.scenes?.some(
    (s: any) => s.referenceImage || s.referenceImageSource || s.localImageId
  );

  const hasOldPropFields = project.scriptData.props?.some(
    (p: any) => p.referenceImage || p.referenceImageSource || p.localImageId
  );

  return hasOldCharacterFields || hasOldVariationFields || hasOldSceneFields || hasOldPropFields;
};
