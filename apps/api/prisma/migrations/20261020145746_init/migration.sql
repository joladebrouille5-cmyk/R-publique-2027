-- CreateEnum
CREATE TYPE "GameMode" AS ENUM ('candidat_reel', 'candidat_personnalise', 'observateur');

-- CreateEnum
CREATE TYPE "Difficulty" AS ENUM ('accessible', 'standard', 'expert');

-- CreateEnum
CREATE TYPE "SaveKind" AS ENUM ('auto', 'manuelle', 'avant_evenement', 'import');

-- CreateEnum
CREATE TYPE "ActionStatus" AS ENUM ('validee', 'rejetee');

-- CreateEnum
CREATE TYPE "DataNature" AS ENUM ('reel', 'estimation', 'sondage', 'projection', 'simule', 'fictif', 'systeme');

-- CreateTable
CREATE TABLE "app_user" (
    "id" UUID NOT NULL,
    "display_name" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "app_user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "game" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "mode" "GameMode" NOT NULL,
    "difficulty" "Difficulty" NOT NULL,
    "seed" TEXT NOT NULL,
    "engine_version" TEXT NOT NULL,
    "ruleset_version" TEXT NOT NULL,
    "save_schema_version" INTEGER NOT NULL,
    "phase" TEXT NOT NULL,
    "week" INTEGER NOT NULL,
    "date" DATE NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,
    "state" JSONB NOT NULL,
    "state_hash" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "game_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "game_save" (
    "id" UUID NOT NULL,
    "game_id" UUID NOT NULL,
    "kind" "SaveKind" NOT NULL,
    "slot" INTEGER,
    "label" TEXT,
    "week" INTEGER NOT NULL,
    "date" DATE NOT NULL,
    "state" JSONB NOT NULL,
    "state_hash" TEXT NOT NULL,
    "engine_version" TEXT NOT NULL,
    "save_schema_version" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "game_save_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "game_action" (
    "id" UUID NOT NULL,
    "game_id" UUID NOT NULL,
    "week" INTEGER NOT NULL,
    "actor_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "ActionStatus" NOT NULL,
    "rejection_reason" TEXT,
    "idempotency_key" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "game_action_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "game_event" (
    "id" UUID NOT NULL,
    "game_id" UUID NOT NULL,
    "week" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "nature" "DataNature" NOT NULL,
    "payload" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "game_event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "simulation_log" (
    "id" UUID NOT NULL,
    "game_id" UUID NOT NULL,
    "week" INTEGER NOT NULL,
    "step" INTEGER NOT NULL,
    "module" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "factors" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "simulation_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "game_user_id_updated_at_idx" ON "game"("user_id", "updated_at");

-- CreateIndex
CREATE INDEX "game_save_game_id_week_idx" ON "game_save"("game_id", "week");

-- CreateIndex
CREATE UNIQUE INDEX "game_save_game_id_slot_key" ON "game_save"("game_id", "slot");

-- CreateIndex
CREATE INDEX "game_action_game_id_week_idx" ON "game_action"("game_id", "week");

-- CreateIndex
CREATE UNIQUE INDEX "game_action_game_id_idempotency_key_key" ON "game_action"("game_id", "idempotency_key");

-- CreateIndex
CREATE INDEX "game_event_game_id_week_idx" ON "game_event"("game_id", "week");

-- CreateIndex
CREATE INDEX "simulation_log_game_id_week_idx" ON "simulation_log"("game_id", "week");

-- AddForeignKey
ALTER TABLE "game" ADD CONSTRAINT "game_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app_user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "game_save" ADD CONSTRAINT "game_save_game_id_fkey" FOREIGN KEY ("game_id") REFERENCES "game"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "game_action" ADD CONSTRAINT "game_action_game_id_fkey" FOREIGN KEY ("game_id") REFERENCES "game"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "game_event" ADD CONSTRAINT "game_event_game_id_fkey" FOREIGN KEY ("game_id") REFERENCES "game"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "simulation_log" ADD CONSTRAINT "simulation_log_game_id_fkey" FOREIGN KEY ("game_id") REFERENCES "game"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Historique immuable (§15) : actions, événements et journal ne sont jamais modifiés.
-- Les suppressions restent possibles uniquement par cascade lors de la suppression d'une partie.
CREATE FUNCTION forbid_history_update() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Historique immuable : modification interdite sur %', TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER game_action_immutable BEFORE UPDATE ON "game_action"
  FOR EACH ROW EXECUTE FUNCTION forbid_history_update();
CREATE TRIGGER game_event_immutable BEFORE UPDATE ON "game_event"
  FOR EACH ROW EXECUTE FUNCTION forbid_history_update();
CREATE TRIGGER simulation_log_immutable BEFORE UPDATE ON "simulation_log"
  FOR EACH ROW EXECUTE FUNCTION forbid_history_update();
