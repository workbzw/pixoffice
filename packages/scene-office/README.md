# @pixoffice/scene-office

Office scene definitions and a separate Pixi presentation entry. It does not depend on a particular animation adapter.

```ts
import { officeScenePack } from '@pixoffice/scene-office' // same as /core
import { createOfficePresentation, configureOfficeAssets } from '@pixoffice/scene-office/pixi'
```

The root/core entry contains world creation, roster, furniture, interaction rules and legacy office migration. It runs headlessly. `/pixi` supplies background, furniture views, projection, occlusion and semantic actor presentation. Pixi is a peer dependency of this combined package, even for installations using only core.

Before loading, call `configureOfficeAssets({ baseUrl, schedule? })`. One office asset base is supported per module instance; it is not a hot asset-switching API. Image assets are supplied separately by the host. In the repository, `npm run assets:export -- /new/public/path` exports the generated resource tree.

The six default office appearances and desk contact profile remain unchanged. A new classroom should implement its own ScenePack and presentation, not patch office conditions into the runtime.
