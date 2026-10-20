/*
  Warnings:

  - You are about to drop the column `idempotency_key` on the `game_action` table. All the data in the column will be lost.
  - Added the required column `advance_id` to the `game_action` table without a default value. This is not possible if the table is not empty.
  - Added the required column `position` to the `game_action` table without a default value. This is not possible if the table is not empty.

*/
-- Garde-fou : en phase 1, aucune action n'était enregistrée (game_action vide). Si des lignes
-- existaient, l'ajout de colonnes obligatoires serait ambigu : on échoue explicitement.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "game_action") THEN
    RAISE EXCEPTION 'game_action contient des données : migration manuelle requise';
  END IF;
END $$;

-- DropIndex
DROP INDEX "game_action_game_id_idempotency_key_key";

-- AlterTable
ALTER TABLE "game_action" DROP COLUMN "idempotency_key",
ADD COLUMN     "advance_id" UUID NOT NULL,
ADD COLUMN     "position" INTEGER NOT NULL;

-- CreateTable
CREATE TABLE "game_advance" (
    "id" UUID NOT NULL,
    "game_id" UUID NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "request_hash" TEXT NOT NULL,
    "from_week" INTEGER NOT NULL,
    "to_week" INTEGER NOT NULL,
    "response" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "game_advance_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "game_advance_game_id_idempotency_key_key" ON "game_advance"("game_id", "idempotency_key");

-- CreateIndex
CREATE INDEX "game_action_advance_id_idx" ON "game_action"("advance_id");

-- CreateIndex
CREATE INDEX "game_event_game_id_created_at_idx" ON "game_event"("game_id", "created_at");

-- AddForeignKey
ALTER TABLE "game_advance" ADD CONSTRAINT "game_advance_game_id_fkey" FOREIGN KEY ("game_id") REFERENCES "game"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "game_action" ADD CONSTRAINT "game_action_advance_id_fkey" FOREIGN KEY ("advance_id") REFERENCES "game_advance"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Historique immuable (§15) : une progression enregistrée n'est jamais modifiée.
CREATE TRIGGER game_advance_immutable BEFORE UPDATE ON "game_advance"
  FOR EACH ROW EXECUTE FUNCTION forbid_history_update();
