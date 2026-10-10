# @pixoffice/scene-farm

Independent headless farm rules (`.`) and opt-in Pixi presentation (`./pixi`). No office or classroom dependency. Create a host-owned clock with `createFarmClock()`, then pass `clock.now` to `createFarmScenePack()` and `createFarmPresentation()`.

Capabilities: `farm.plant` (`plotId`, `crop`), `farm.water` (`plotId`), `farm.harvest` (`plotId`), each with one `{ entityId, role: 'farmer' }` participant. They reserve the farmer body and plot, walk to the registered work cell, play an explicit semantic action, then commit validated state proposals. Harvest resets the plot and increments the inventory together. Cancellation produces no uncompleted effect.

`cropStatus(state, clock.now())` derives stages without per-frame state writes. Growth starts after a successful watering; all crops need one watering in this initial version. `tendFarm()` is an optional demo policy, not an AI agent or a mandatory scheduler. External hosts can drive capabilities directly and should not enable the local policy at the same time.

The initial example pauses offline and offers 1x/4x growth. It is not an agronomic simulator. Weather, pests, trading and offline progress are not implemented.

Two decorative hens wander over free floor cells and periodically stop to peck. `createFarmFlock(world, templates, random?)` is a headless, testable ambient controller using the existing grid navigation. Pixi displays whole-body walking/pecking frames from the farm-only chicken atlas. They share the scene ticker, freeze when the host farm clock pauses, and keep natural movement speed at 4x crop growth. They are not workers, do not consume task reservations, and are not persisted as business entities.

The example injects a separate, unscaled active-time clock into runtime deadlines. Pausing stops task deadlines as well as movement; 4x crop growth does not shorten task execution timeouts.

The full background is always fitted into the viewport. Farmers and plots use a shared 1.5x visual scale, with 5x3-cell plot footprints and a work anchor immediately outside each plot. The example migrates version-1 layouts while preserving crops, inventory and records; the first save keeps the old envelope under `pixoffice:farm:v1:layout-v1-backup`.
