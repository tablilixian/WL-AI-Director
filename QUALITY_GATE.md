# 质量门禁落地说明（Team Quality Gate）

> 适用对象：全体开发成员
> 目标：让每一笔提交都自动过一遍质量关，逐步还清技术债，把"高级开发工程师把控"沉淀成团队习惯。
> 生效时间：2026-08-06

---

## 1. 我们做了什么（地基已就位）

| 能力                                  | 状态                      | 说明                                   |
| ------------------------------------- | ------------------------- | -------------------------------------- |
| TypeScript `strict` 模式              | ✅ 已开启                 | 编译期 `tsc --noEmit` **0 错误**       |
| ESLint 9 (flat config)                | ✅ 已配置                 | 只开 error 级真实 bug 规则 + 少量 warn |
| Prettier 3                            | ✅ 已配置                 | 统一格式，提交时自动格式化             |
| pre-commit 门禁 (husky + lint-staged) | ✅ 已生效                 | 只校验**暂存文件**，不阻塞存量债       |
| 单元测试门禁                          | ✅ 18 文件 / 242 用例全绿 | E2E 已正确排除，避免误收集             |
| CI 远程门禁 (GitHub Actions)          | ✅ 已接入                 | push/PR 到 dev/main 自动跑门禁         |
| 一个真实 bug 修复                     | ✅                        | 云端同步嵌套图片 URL 永不被回写        |

新增文件：`eslint.config.js`、` .prettierrc`、` .prettierignore`、`.husky/pre-commit`。
修改文件：`package.json`（scripts + devDeps）、`tsconfig.json`、`vitest.config.ts`。

---

## 2. 团队日常：三条命令

```bash
# 1) 类型检查（strict，CI/提交前必看）
npm run typecheck

# 2) 代码规范（只报告，不修改）
npm run lint
# 想自动修一部分：npm run lint:fix

# 3) 跑单测（CCI 用非 watch 模式）
npm run test:ci
# 本地开发用 watch 模式：npm test
```

**提交时的自动门禁**（无需手动跑，commit 时 husky 自动触发）：

```text
git commit → husky pre-commit → lint-staged
  ├─ 对所有暂存 .ts/.tsx：eslint --fix   （自动修可修复项，error 级残留会拦下提交）
  └─ 对所有暂存文件：prettier --write     （统一格式）
```

> 门禁**只处理你这次改动的文件**（暂存区），所以不会因为有历史技术债就拒绝你提交。这就是"渐进式门禁"。

### 2.1 CI 远程门禁（远程也卡）

本地 pre-commit 把关，但别人本地可以跳过 hook。CI 门禁（`.github/workflows/ci.yml`）在 **push 到 `dev`/`main`** 或 **开 PR 到 `dev`/`main`** 时自动跑，让门禁不止本地。

```text
push / PR → GitHub Actions: quality-gate
  ├─ npm ci
  ├─ npm run typecheck          （全量，必须 0 错误）
  ├─ npm run test:ci            （全量，242 用例必须全绿）
  └─ 增量 lint / format（仅本次改动文件）
       ├─ npx eslint            （error 级阻塞合并；warning 暂作 advisory）
       └─ npx prettier --check  （未格式化即阻塞）
```

**设计取舍**：

- `typecheck` 与 `test:ci` 走**全量**——它们是硬性底线，必须全绿。
- `eslint` / `prettier` 走**增量**（只校验本次 PR/提交改动的文件）——与 pre-commit 一致，**不阻塞存量技术债**；新引入的 error 才会卡合并。

**⚠️ 必须手动开启的一步（否则检查会跑但不阻塞合并）**：
仓库 Settings → Branches → Branch protection rule，对 `dev`（及 `main`）勾选 **Require status checks to pass before merging**，并在下拉里选中 `quality-gate` 这个 check。

**未来收紧**：待存量 warning 债清理后，把 lint 步骤改为 `npx eslint --max-warnings=0`，让 `no-explicit-any` / `no-console` 等也升级为阻塞项。

---

## 3. 遇到门禁拦截怎么办

- **ESLint 报 error 拦下提交**：在报错文件里修掉对应问题再 `git add` 重新提交。lint-staged 已自动 `--fix` 能修的，剩下的是必须你判断的真问题（未定义变量、危险类型断言等）。
- **不想这次处理某条 warn**：warn 不拦提交，error 才拦。如果某 error 暂时无法修，先和 reviewer 沟通，不要用 `// eslint-disable` 草草压掉（确需禁用要写理由）。
- **Prettier 改了你的格式**：正常现象，让它改。统一风格比个人偏好重要。

---

## 4. 已知技术债（存量，不阻塞，但要逐步还）

诊断时量化出的存量（**非门禁范围**，门禁只管增量）：

| 类别             | 量级              | 计划                                                  |
| ---------------- | ----------------- | ----------------------------------------------------- |
| ESLint error     | ~750              | 按模块分批修，纳入日常 PR                             |
| ESLint warning   | ~1411             | 含 `no-explicit-any`/`no-console` 等，逐步收紧        |
| `console.*` 散落 | ~285 处           | 统一日志层后替换                                      |
| 巨型组件         | 12 个文件 >500 行 | `GenerateVideoPanel.tsx` 达 2323 行，需拆分 (Phase 2) |

**偿还原则**：新代码必须遵守门禁；存量债通过"顺手清"（改到哪个文件顺手修该文件的相关告警）逐步消化，不做一次性大改以免引入回归。

---

## 5. 路线图（下一步，待排期）

- **Phase 1 — CI 接入**：✅ 已完成（`.github/workflows/ci.yml`，GitHub Actions）。
- **Phase 2 — 重构还债**：巨型组件拆分、统一日志层、逐步把 `any` 换成精确类型。
- **Phase 3 — 规范加固**：随债减少，把部分 warn 提升为 error（如 `no-explicit-any`）。

---

## 6. 常见坑（FAQ）

**Q：为什么 `tests/e2e/*.spec.ts` 不进 Vitest？**
A：那是 Playwright E2E 规格，需要浏览器 + PocketBase 服务，由 `playwright test` 单独跑。之前被 Vitest 误收集会导致 `test.describe` 抛错，已在 `vitest.config.ts` 的 `exclude` 中排除。

**Q：我本地 `npm run lint` 报了 750 个 error，是不是我搞坏了？**
A：不是。那是全量存量债（`eslint .` 扫整个仓库）。pre-commit 门禁只扫你暂存的文件，不会被这些历史 error 拦住。

**Q：strict 模式会不会让我写代码很难受？**
A：短期会多一些类型标注，但能帮你提前抓住 `undefined` 访问、错误类型等线上事故高发点。已修复的 87 个真实 strict 错误就是例证。

**Q：怎么跑 E2E？**
A：参照 `playwright.config.ts` 与 `tests/e2e/`，需先起本地 PocketBase 与 dev server，再 `npx playwright test`。

---

## 7. 一句话总结

> 门禁管增量、债留作存量；提交即质检，风格自动齐；strict 守底线，还债日常里。
