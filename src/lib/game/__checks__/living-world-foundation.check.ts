import {
  deepestWorldTier,
  freshStartDivision,
  promotionDestinationsForDefinition,
  worldDivisionsAtTier,
  type WorldDivisionDefinition,
} from "../worldPyramid";
import { clubIdentity, externalClubIdentities } from "../clubIdentities";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

export function runLivingWorldFoundationChecks(): void {
  const parallel: readonly WorldDivisionDefinition[] = [
    { id: "l4", name: "Level Six", tier: 4, reputationRange: [14, 36] },
    {
      id: "l7-central",
      name: "Regional Premier Central",
      tier: 5,
      reputationRange: [8, 24],
      lane: "central",
      feedsInto: ["l4"],
      freshStart: true,
    },
    {
      id: "l7-south",
      name: "Regional Premier South",
      tier: 5,
      reputationRange: [8, 24],
      lane: "south",
      feedsInto: ["l4"],
    },
  ];

  assert(deepestWorldTier(parallel) === 5, "parallel divisions must not inflate deepest tier");
  assert(worldDivisionsAtTier(5, parallel).length === 2, "same-tier siblings must remain distinct");
  assert(freshStartDivision(parallel).id === "l7-central", "fresh start must resolve one explicit lane");
  assert(
    promotionDestinationsForDefinition(parallel[1], parallel)[0] === "l4",
    "parallel regional division must retain explicit upward routing",
  );

  const devils = clubIdentity("eng-manchester-devils");
  assert(devils?.displayName === "Manchester Devils", "authored club identity must be stable by id");
  assert(
    externalClubIdentities().every((club) => club.scope === "external"),
    "external club catalogue must not leak domestic clubs",
  );
}
