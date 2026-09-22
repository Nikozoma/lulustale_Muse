export type BattlePhase = "player_turn" | "enemy_turn" | "victory" | "defeat";

export type BattlePlayer = {
  name: string;
  hp: number;
  maxHp: number;
  attack: number;
  defense: number;
  speed: number;
  defending: boolean;
};

export type BattleEnemy = {
  id: string;
  name: string;
  hp: number;
  maxHp: number;
  attack: number;
  defense: number;
  speed: number;
  experienceReward: number;
};

export type BattleInventory = {
  fries: number;
};

export type TurnBasedBattleState = {
  id: string;
  round: number;
  phase: BattlePhase;
  player: BattlePlayer;
  enemies: BattleEnemy[];
  inventory: BattleInventory;
  log: string[];
};

export type BattlePlayerInput = {
  name: string;
  hp: number;
  maxHp: number;
  attack: number;
  defense: number;
  speed: number;
};

export type BattleActionResult = {
  state: TurnBasedBattleState;
  consumedItemId: "fries" | null;
};

const BIRD_GANG_ENEMIES: ReadonlyArray<Omit<BattleEnemy, "hp">> = [
  {
    id: "bird_lookout",
    name: "Bird Lookout",
    maxHp: 7,
    attack: 3,
    defense: 1,
    speed: 7,
    experienceReward: 4
  },
  {
    id: "primary_fries_thief",
    name: "Fries Thief",
    maxHp: 8,
    attack: 4,
    defense: 2,
    speed: 8,
    experienceReward: 6
  },
  {
    id: "peck_captain",
    name: "Peck Captain",
    maxHp: 13,
    attack: 5,
    defense: 3,
    speed: 6,
    experienceReward: 8
  }
];

export function createBirdGangBattle(player: BattlePlayerInput, friesCount = 0): TurnBasedBattleState {
  return {
    id: "bird_gang_day1",
    round: 1,
    phase: "player_turn",
    player: {
      ...player,
      hp: Math.max(1, Math.min(player.maxHp, player.hp)),
      defending: false
    },
    enemies: BIRD_GANG_ENEMIES.map((enemy) => ({ ...enemy, hp: enemy.maxHp })),
    inventory: { fries: Math.max(0, friesCount) },
    log: ["The bird gang blocks Lulu's path.", "Lulu's turn."]
  };
}

export function attackEnemy(state: TurnBasedBattleState, enemyId: string): BattleActionResult {
  if (state.phase !== "player_turn") return unchanged(state);
  const target = state.enemies.find((enemy) => enemy.id === enemyId && enemy.hp > 0);
  if (!target) return unchanged(state);

  const damage = calculateDamage(state.player.attack, target.defense);
  const enemies = state.enemies.map((enemy) =>
    enemy.id === enemyId ? { ...enemy, hp: Math.max(0, enemy.hp - damage) } : enemy
  );
  const defeated = enemies.find((enemy) => enemy.id === enemyId)?.hp === 0;
  const log = appendLog(
    state.log,
    `Lulu attacks ${target.name} for ${damage} damage.${defeated ? ` ${target.name} is defeated.` : ""}`
  );

  if (enemies.every((enemy) => enemy.hp <= 0)) {
    return {
      state: { ...state, enemies, phase: "victory", player: { ...state.player, defending: false }, log: appendLog(log, "Victory!") },
      consumedItemId: null
    };
  }

  return {
    state: { ...state, enemies, phase: "enemy_turn", player: { ...state.player, defending: false }, log },
    consumedItemId: null
  };
}

export function defend(state: TurnBasedBattleState): BattleActionResult {
  if (state.phase !== "player_turn") return unchanged(state);
  return {
    state: {
      ...state,
      phase: "enemy_turn",
      player: { ...state.player, defending: true },
      log: appendLog(state.log, "Lulu braces for the bird gang's attack.")
    },
    consumedItemId: null
  };
}

export function useFries(state: TurnBasedBattleState): BattleActionResult {
  if (state.phase !== "player_turn" || state.inventory.fries <= 0 || state.player.hp >= state.player.maxHp) {
    return unchanged(state);
  }
  const healed = Math.min(8, state.player.maxHp - state.player.hp);
  return {
    state: {
      ...state,
      phase: "enemy_turn",
      player: { ...state.player, hp: state.player.hp + healed, defending: false },
      inventory: { ...state.inventory, fries: state.inventory.fries - 1 },
      log: appendLog(state.log, `Lulu eats some surviving fries and restores ${healed} HP.`)
    },
    consumedItemId: "fries"
  };
}

export function resolveEnemyTurn(state: TurnBasedBattleState): TurnBasedBattleState {
  if (state.phase !== "enemy_turn") return state;

  let hp = state.player.hp;
  let log = state.log;
  const livingEnemies = state.enemies.filter((enemy) => enemy.hp > 0).sort((a, b) => b.speed - a.speed);

  for (const enemy of livingEnemies) {
    const rawDamage = calculateDamage(enemy.attack, state.player.defense);
    const damage = state.player.defending ? Math.max(1, Math.ceil(rawDamage / 2)) : rawDamage;
    hp = Math.max(0, hp - damage);
    log = appendLog(log, `${enemy.name} attacks for ${damage} damage.`);
    if (hp <= 0) {
      return {
        ...state,
        phase: "defeat",
        player: { ...state.player, hp: 0, defending: false },
        log: appendLog(log, "Lulu is knocked down.")
      };
    }
  }

  return {
    ...state,
    round: state.round + 1,
    phase: "player_turn",
    player: { ...state.player, hp, defending: false },
    log: appendLog(log, `Round ${state.round + 1}. Lulu's turn.`)
  };
}

export function getBattleExperienceReward(state: TurnBasedBattleState): number {
  return state.enemies.reduce((total, enemy) => total + enemy.experienceReward, 0);
}

export function livingEnemies(state: TurnBasedBattleState): BattleEnemy[] {
  return state.enemies.filter((enemy) => enemy.hp > 0);
}

export function calculateDamage(attack: number, defense: number): number {
  return Math.max(1, Math.round(attack - defense * 0.6));
}

function unchanged(state: TurnBasedBattleState): BattleActionResult {
  return { state, consumedItemId: null };
}

function appendLog(log: readonly string[], entry: string): string[] {
  return [...log.slice(-7), entry];
}
