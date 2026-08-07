// @ts-check
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

/**
 * 质量门禁 - ESLint flat config (ESLint 9)
 *
 * 设计原则（brownfield 渐进式采纳）：
 * 1. 只启用"真实 bug"类 error 规则，避免噪音劝退团队。
 * 2. `no-explicit-any` 已升 error（P1 警告收紧第二项，与 `no-non-null-assertion` 同理）；
 *    存量 524 处靠增量门禁逐步消化（改到哪个文件顺手清该文件的 any），不阻塞全仓。
 * 3. prettier 放在最后，关闭所有与格式化冲突的规则。
 * 4. pre-commit 仅校验暂存文件（lint-staged），存量问题不阻塞，改到哪清到哪。
 */
export default tseslint.config(
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      'pb_data/**',
      'pb_data_backup*/**',
      'pb_hooks/**',
      'pb_migrations/**',
      'playwright-report/**',
      'test-results/**',
      'coverage/**',
      'scripts/**',
      '**/*.config.ts',
      '**/*.config.js',
      // 第三方生成代码（ffmpeg wasm core），非源码、不在清理范围内
      'public/ffmpeg/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  prettier,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
    },
    rules: {
      // 真实 bug / 强约束（error）—— 仅非类型感知规则，保证 lint 快且无需 project 配置
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', ignoreRestSiblings: true },
      ],
      // 注：no-misused-promises / await-thenable 需要类型信息(type-checked)，
      // 后续启用 tseslint.configs.recommendedTypeChecked 时再加。

      // 渐进收紧（当前 warn，后续升级 error）
      '@typescript-eslint/no-empty-object-type': 'warn',

      // 已升级 error（P1 警告收紧第二项，与 no-non-null-assertion 同理）：
      // no-explicit-any 是类型逃逸的温床（any 会传染、绕过全部类型检查），提为 error。
      // 门禁增量特性：仅校验暂存文件，存量 524 处不阻塞全仓，改到哪清到哪。
      '@typescript-eslint/no-explicit-any': 'error',
      // 优先升级：no-non-null-assertion 是运行时崩溃直接来源（obj!.prop 在 null 时抛错白屏），
      // 提为 error。门禁增量特性：仅校验暂存文件，存量 117 处不阻塞全仓，改到哪清到哪。
      '@typescript-eslint/no-non-null-assertion': 'error',

      // 日志纪律：禁止裸 console.*（替换为统一 logger，见 services/logger）。
      // 升 error：app/组件/服务源码一律不得直接 console.*，由 logger 统一出口，便于开关与追踪。
      // 例外（正当用途保留）：① logger 原语自身(已 eslint-disable)；② vite 构建插件(构建期输出)；
      // ③ tests/ 与 *.spec.ts(测试断言/调试)。增量门禁仅卡暂存文件，存量不阻塞。
      'no-console': 'error',

      // 基础可读性（来自 eslint:recommended）
      'no-debugger': 'error',
      'no-duplicate-imports': 'error',
    },
  },
  // 例外：构建期插件 / 测试环境允许裸 console.*（正当用途）；vite 插件含构建期 any 一并豁免
  {
    files: ['**/vite-plugin-*.ts', '**/tests/**/*.{ts,tsx}', '**/*.spec.ts', '**/*.spec.tsx'],
    rules: {
      'no-console': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
);
