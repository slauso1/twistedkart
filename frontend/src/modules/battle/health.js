// Simple battle health system for Twisted Kart battle mode
// Rapier version: `ammo` param removed; carBody is now a Rapier RigidBody

export function createHealthSystem({ getCarBody, onRespawn, maxHealth = 100, invulnMs = 2000 }) {
  let health = maxHealth;
  let invulnerable = false;

  function damage(amount) {
    if (invulnerable) return { health, invulnerable };
    health = Math.max(0, health - amount);
    if (health === 0) respawn();
    return { health, invulnerable };
  }

  function heal(amount) {
    health = Math.min(maxHealth, health + amount);
    return { health, invulnerable };
  }

  function setHealth(value) {
    health = Math.max(0, Math.min(maxHealth, value));
    return { health, invulnerable };
  }

  function respawn() {
    const body = getCarBody && getCarBody();
    if (!body) return { health, invulnerable };

    // Zero velocities (Rapier API – no manual destroy needed)
    body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    body.setAngvel({ x: 0, y: 0, z: 0 }, true);

    // Teleport to arena centre, 3 m up
    body.setTranslation({ x: 0, y: 3, z: 0 }, true);
    body.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true);

    // Callback for custom spawn behaviour / FX
    if (onRespawn) onRespawn();

    health = maxHealth;
    invulnerable = true;
    setTimeout(() => { invulnerable = false; }, invulnMs);

    return { health, invulnerable };
  }

  function getState() {
    return { health, maxHealth, invulnerable };
  }

  return { damage, heal, setHealth, respawn, getState };
}

