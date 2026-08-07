# 统一日志系统使用指南

> 对应需求：① 调试开关 ② 出错能定位（在哪 + 为什么）③ 统一接口，禁止 console 到处调用
> 实现：`services/logger.ts`（配合 eslint `no-console: error`，见 `eslint.config.js`）

## 1. 统一入口（三选一）

### 1.1 推荐：按类别创建作用域日志器 `createLogger`

组件 / 服务只持有一次，调用时**不再传 category，也绝不直接碰 console**：

```ts
import { createLogger, LogCategory } from '../services/logger';

const log = createLogger(LogCategory.CANVAS);

log.debug('图层已添加', layer); // 调试信息（开发环境可见，生产默认隐藏）
log.info('画布已保存'); // 普通信息
log.warn('图片较大，可能较慢', { size }); // 警告
log.error('保存失败', err); // 出错（自动记录位置 + 原因 + 堆栈）
```

### 1.2 记录真实错误的首选：`errorFrom`

把原始 `Error` 丢进来，**自动带出「出错位置 file:line」「原因 message」「完整堆栈」**，无需手写：

```ts
try {
  await canvasModelService.generateImage({ ... });
} catch (err) {
  log.errorFrom(err, '三视图生成失败');   // 第二参是上下文说明（可选）
}
```

### 1.3 全局 logger（无作用域，需每次传 category）

仅适合一次性调用或脚本入口：

```ts
import { logger, LogCategory } from '../services/logger';
logger.error(LogCategory.API, '请求失败', err);
```

## 2. 调试开关

- **生产环境**：默认 `minLevel = INFO`（DEBUG 噪声自动隐藏）。
- **开发环境**：默认 `minLevel = DEBUG`（全可见）。
- 运行时一键切换：

```ts
logger.setDebugEnabled(false); // 关闭 DEBUG（仅 INFO 及以上）
logger.setDebugEnabled(true); // 重新打开
```

- 还可按类别过滤：`logger.setCategoryEnabled(LogCategory.API, false)` 屏蔽某类。
- 配置持久化到 `localStorage['logger_config']`，刷新不丢。

## 3. 出错可追溯（ERROR 自动输出三要素）

控制台 ERROR 输出示例：

```
[10:00:45.944] [ERROR] [CANVAS] 三视图生成失败
  ↳ 出错位置: ThreeViewPanel.tsx:85
  ↳ 原因: Failed to fetch
  ↳ Error: Failed to fetch
      at async handleGenerate (ThreeViewPanel.tsx:85:13)
      ...
```

- 「在哪出的错」= `entry.location`（自动跳过敏感内部帧，定位到真实调用点）
- 「为什么」= `entry.cause`（原始 Error 的 message）
- 完整 `entry.stack` 一并记录，便于深查
- 结构化日志（经 `addListener` / `getStorage`）同样携带 `location` / `cause` / `stack` 字段，便于上报/检索

## 4. 纪律：禁止裸 `console.*`

- eslint `no-console` 已升 **error**，app / 组件 / 服务源码直接调用 `console.log/info/warn/error` 会被门禁拦下。
- 统一走 `logger` / `createLogger` 出口，好处：可全局开关、可分类过滤、可持久化、出错自动带栈。
- **例外（正当用途，已配置豁免）**：`services/logger.ts` 自身、`vite-plugin-*.ts` 构建插件、`tests/**` 与 `*.spec.ts` 测试。

## 5. 类型约定

- 负载参数类型为 `unknown`（日志是数据汇 sink，从不消费其结构，只透传 / 序列化）。
  调用方传 `Error` / 对象 / 字符串均合法，且比 `any` 更安全（读回时强制收窄）。
- 级别 `LogLevel`（数值枚举，便于 `level >= minLevel` 阈值比较）、分类 `LogCategory`（字符串枚举，穷尽补全）。
