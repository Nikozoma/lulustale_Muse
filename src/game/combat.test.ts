import { describe, expect, it } from "vitest";
import {
  attackEnemy,
  createBirdGangBattle,
  defend,
  getBattleExperienceReward,
  resolveEnemyTurn,
  useFries
} from "./combat";

const player = { name: "Lulu", hp: 20, maxHp: 20, attack: 9, defense: 4, speed: 5 };

describe("turn-based battle system", () => {
  it("creates the Day 1 bird-gang encounter from the real bird roles", () => {
    const battle = createBirdGangBattle(player, 1);
    expect(battle.phase).toBe("player_turn");
    expect(battle.enemies.map((enemy) => enemy.id)).toEqual([
      "bird_lookout",
      "primary_fries_thief",
      "peck_captain"
    ]);
    expect(battle.enemies.map((enemy) => enemy.id)).toEqual(["bird_lookout", "primary_fries_thief", "peck_captain"]);
    expect(getBattleExperienceReward(battle)).toBe(18);
  });

  it("supports player attacks followed by an enemy turn", () => {
    const battle = createBirdGangBattle(player);
    const attacked = attackEnemy(battle, "bird_lookout").state;
    expect(attacked.enemies[0].hp).toBeLessThan(attacked.enemies[0].maxHp);
    expect(attacked.phase).toBe("enemy_turn");

    const afterEnemies = resolveEnemyTurn(attacked);
    expect(afterEnemies.phase).toBe("player_turn");
    expect(afterEnemies.round).toBe(2);
    expect(afterEnemies.player.hp).toBeLessThan(player.hp);
  });

  it("defend reduces incoming damage", () => {
    const normal = resolveEnemyTurn(attackEnemy(createBirdGangBattle(player), "bird_lookout").state);
    const guarded = resolveEnemyTurn(defend(createBirdGangBattle(player)).state);
    expect(guarded.player.hp).toBeGreaterThan(normal.player.hp);
  });

  it("uses fries as a real combat consumable", () => {
    const hurtPlayer = { ...player, hp: 8 };
    const battle = createBirdGangBattle(hurtPlayer, 1);
    const result = useFries(battle);
    expect(result.consumedItemId).toBe("fries");
    expect(result.state.player.hp).toBe(16);
    expect(result.state.inventory.fries).toBe(0);
    expect(result.state.phase).toBe("enemy_turn");
  });

  it("reaches victory after all enemies are defeated", () => {
    let battle = createBirdGangBattle({ ...player, attack: 99 });
    for (const id of ["bird_lookout", "primary_fries_thief", "peck_captain"]) {
      battle = attackEnemy({ ...battle, phase: "player_turn" }, id).state;
    }
    expect(battle.phase).toBe("victory");
  });

  it("supports a defeat state", () => {
    let battle = createBirdGangBattle({ ...player, hp: 1, maxHp: 20, defense: 0 });
    battle = defend(battle).state;
    battle.player.defending = false;
    battle = resolveEnemyTurn(battle);
    expect(battle.phase).toBe("defeat");
    expect(battle.player.hp).toBe(0);
  });
  it("keeps the first demo encounter winnable with Lulu's equipped Bush Sword baseline", () => {
    let battle = createBirdGangBattle(player);
    for (const id of ["bird_lookout", "primary_fries_thief", "peck_captain", "peck_captain"]) {
      battle = attackEnemy(battle, id).state;
      if (battle.phase === "enemy_turn") battle = resolveEnemyTurn(battle);
    }
    expect(battle.phase).toBe("victory");
    expect(battle.player.hp).toBeGreaterThan(0);
  });

});
