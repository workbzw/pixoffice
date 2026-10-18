# 场景视图与应用界面

当前办公室、教室、农场和轴测办公室预览都按三个部分装配：

```text
App / RuntimeWorkspace（装配入口）
├── controller（场景实例、状态、命令、数据连接）
├── scene（画布、场景内内容、资源加载反馈）
└── ui / Shell（导航、按钮、表单、统计、业务面板）
```

`Shell` 通过 `scene` 插槽安排场景的位置，也可以传入按钮等覆盖层。覆盖层仍属于应用界面；场景自己的白板、人物铭牌和字幕属于场景视图。双方共享控制层提供的状态和操作，不互相创建或销毁。

## 目录

| 入口 | 控制层 | 场景 | 默认界面 |
| --- | --- | --- | --- |
| `example/office-web/src/components/RuntimeWorkspace.tsx` | `src/controller/useOfficeSceneController.ts` | `src/components/OfficeCanvas.tsx` | `src/ui/OfficeShell.tsx` |
| `example/classroom/src/ClassroomApp.tsx` | `src/controller/useClassroomController.ts` | `src/scene/ClassroomScene.tsx` | `src/ui/ClassroomShell.tsx` |
| `example/farm/src/FarmApp.tsx` | `src/controller/useFarmController.ts` | `src/scene/FarmScene.tsx` | `src/ui/FarmShell.tsx` |
| `example/dimetric/src/studio/StudioApp.tsx` | `controller/useStudioController.ts` | `scene/StudioScene.tsx` | `ui/StudioShell.tsx` |

场景样式跟随场景模块，界面样式跟随 Shell；根目录的 CSS 只保留基础主题。经典办公室的地图编辑和人物菜单在 `ui/OfficeSceneControls.tsx`，聊天框在装配层作为覆盖界面接入。

## 装配与替换

默认 `layout="full"` 还原完整页面；`layout="scene"` 只展示场景。各应用还接受 `shell` React 组件，用来替换默认外层界面。

```tsx
<FarmApp assetBaseUrl="/farm-assets/" layout="scene" />
<FarmApp assetBaseUrl="/farm-assets/" shell={MyFarmShell} />
```

自定义 Shell 接收对应的 `ShellProps`。例如农场 Shell 可以把 `scene()` 放到任意有明确尺寸的容器里，通过 `controller.start()` 发起农作；办公室 Shell 接收装配好的 `scene` 节点和业务操作回调。

运行中更换 `layout` 或 `shell` 时，保留 App 的 React 身份和控制层。`example/shared/scene/SceneHost.ts` 持有同一渲染 DOM 根节点，`SceneSurface` 将它移动到新容器，控制层持有的运行时和画布继续使用。卸载整个 App、改变场景资源地址或场景连接参数时，才按相应生命周期重新创建场景。通过跳转 URL 重新加载页面不属于运行中的布局切换。

本地预览可在现有地址加 `?layout=scene`：

- `/office/?layout=scene`
- `/classroom/?layout=scene`
- `/farm/?layout=scene`
- 独立轴测入口 `/?layout=scene`

只展示场景时仍可由外部网关或控制层驱动，页面操作按钮由完整 Shell 或自定义 Shell 提供。

## 后续配置层接入位置

未来的前端能力配置应由装配层消费：界面配置选择 Shell 的区域和组件，场景配置选择场景及实体。运行时、动画播放器和画面挂点仍由场景模块维护。本次没有新增或定稿任何后端协议。
