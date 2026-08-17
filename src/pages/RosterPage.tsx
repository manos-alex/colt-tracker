import { Dispatch, FormEvent, SetStateAction, useRef, useState } from "react";
import DeleteConfirmationModal from "../components/DeleteConfirmationModal";
import { createPlayer, deletePlayer, updatePlayer as updateApiPlayer } from "../lib/api";
import type { AppData, Id, Player } from "../types";

type DataSetter = Dispatch<SetStateAction<AppData>>;

const now = () => new Date().toISOString();

function RosterPage({ data, setData }: { data: AppData; setData: DataSetter }) {
  const [playerName, setPlayerName] = useState("");
  const [rosterPlayer, setRosterPlayer] = useState(true);
  const [isAddingPlayer, setIsAddingPlayer] = useState(false);
  const [isEditingRoster, setIsEditingRoster] = useState(false);
  const [playerPendingDelete, setPlayerPendingDelete] = useState<Player | null>(null);
  const [deletingPlayerIds, setDeletingPlayerIds] = useState<Set<Id>>(() => new Set());
  const [error, setError] = useState("");
  const playerMutationVersions = useRef(new Map<Id, number>());

  const addPlayer = async (event: FormEvent) => {
    event.preventDefault();
    const name = playerName.trim();
    if (!name || isAddingPlayer) return;

    setIsAddingPlayer(true);
    setError("");

    try {
      const player = await createPlayer({ name, rosterPlayer });
      setData((current) => ({ ...current, players: [...current.players, player] }));
      setPlayerName("");
      setRosterPlayer(true);
    } catch (apiError) {
      setError(apiError instanceof Error ? apiError.message : "Unable to add player.");
    } finally {
      setIsAddingPlayer(false);
    }
  };

  const updatePlayer = (playerId: Id, patch: Partial<Player>) => {
    const mutationVersion = (playerMutationVersions.current.get(playerId) ?? 0) + 1;
    playerMutationVersions.current.set(playerId, mutationVersion);
    setError("");

    setData((current) => ({
      ...current,
      players: current.players.map((player) =>
        player.id === playerId ? { ...player, ...patch, updatedAt: now() } : player,
      ),
    }));

    void updateApiPlayer(playerId, patch)
      .then((persistedPlayer) => {
        if (playerMutationVersions.current.get(playerId) !== mutationVersion) return;

        setData((current) => ({
          ...current,
          players: current.players.map((player) =>
            player.id === playerId ? persistedPlayer : player,
          ),
        }));
      })
      .catch((apiError) => {
        setError(apiError instanceof Error ? apiError.message : "Unable to update player.");
      });
  };

  const removePlayer = async (playerId: Id) => {
    if (deletingPlayerIds.has(playerId)) return;

    setDeletingPlayerIds((current) => new Set(current).add(playerId));
    setError("");

    try {
      await deletePlayer(playerId);
      setData((current) => ({
        ...current,
        players: current.players.filter((item) => item.id !== playerId),
        tournamentPlayers: current.tournamentPlayers.filter((item) => item.playerId !== playerId),
        pointPlayers: current.pointPlayers.filter((item) => item.playerId !== playerId),
        events: current.events.map((item) => ({
          ...item,
          playerId: item.playerId === playerId ? null : item.playerId,
          secondaryPlayerId: item.secondaryPlayerId === playerId ? null : item.secondaryPlayerId,
        })),
        games: current.games.map((item) => ({
          ...item,
          activeThrowerId: item.activeThrowerId === playerId ? null : item.activeThrowerId,
        })),
        points: current.points.map((item) => ({
          ...item,
          initialThrowerId: item.initialThrowerId === playerId ? null : item.initialThrowerId,
        })),
      }));
      setPlayerPendingDelete(null);
    } catch (apiError) {
      setError(apiError instanceof Error ? apiError.message : "Unable to remove player.");
    } finally {
      setDeletingPlayerIds((current) => {
        const next = new Set(current);
        next.delete(playerId);
        return next;
      });
    }
  };

  const rosteredCount = data.players.filter((player) => player.rosterPlayer).length;

  return (
    <section className="page-stack">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Roster</p>
          <h1>Players</h1>
        </div>
        <div className="metric-strip">
          <span>{data.players.length} total</span>
          <span>{rosteredCount} rostered</span>
        </div>
      </div>

      <section className="wide-panel">
        {error && <p className="status-banner error">{error}</p>}
        <div className="panel-heading">
          <h2>Roster</h2>
          <div className="section-actions">
            <span>{data.players.length}</span>
            <button
              className={isEditingRoster ? "primary-button compact-button" : "ghost-button compact-button"}
              onClick={() => setIsEditingRoster((current) => !current)}
            >
              {isEditingRoster ? "Done" : "Edit"}
            </button>
          </div>
        </div>
        {isEditingRoster && (
          <form className="roster-form" onSubmit={addPlayer}>
            <input
              value={playerName}
              onChange={(event) => setPlayerName(event.target.value)}
              placeholder="Player name"
            />
            <label className="toggle-row">
              <input
                type="checkbox"
                checked={rosterPlayer}
                onChange={(event) => setRosterPlayer(event.target.checked)}
              />
              <span>Rostered</span>
            </label>
            <button type="submit" disabled={isAddingPlayer}>
              {isAddingPlayer ? "Adding" : "Add Player"}
            </button>
          </form>
        )}

        <div className={`table-list roster-list ${isEditingRoster ? "is-editing" : ""}`}>
          <div className="table-header">
            <span>Name</span>
            <span>Rostered</span>
            {isEditingRoster && <span />}
          </div>
          {data.players.map((player) => (
            <div className="table-row" key={player.id}>
              {isEditingRoster ? (
                <input
                  value={player.name}
                  onChange={(event) => updatePlayer(player.id, { name: event.target.value })}
                  aria-label={`${player.name} name`}
                />
              ) : (
                <strong className="roster-player-name">{player.name}</strong>
              )}
              {isEditingRoster ? (
                <label className="toggle-row">
                  <input
                    type="checkbox"
                    checked={player.rosterPlayer}
                    onChange={(event) =>
                      updatePlayer(player.id, { rosterPlayer: event.target.checked })
                    }
                  />
                  <span>{player.rosterPlayer ? "Yes" : "No"}</span>
                </label>
              ) : (
                <span className="roster-status">{player.rosterPlayer ? "Yes" : "No"}</span>
              )}
              {isEditingRoster && (
                <button
                  className="schedule-remove-button"
                  disabled={deletingPlayerIds.has(player.id)}
                  onClick={() => setPlayerPendingDelete(player)}
                >
                  {deletingPlayerIds.has(player.id) ? "Removing" : "Remove"}
                </button>
              )}
            </div>
          ))}
        </div>
      </section>
      {playerPendingDelete && (
        <DeleteConfirmationModal
          itemName={`${playerPendingDelete.name} from roster`}
          isConfirming={deletingPlayerIds.has(playerPendingDelete.id)}
          onCancel={() => setPlayerPendingDelete(null)}
          onConfirm={() => void removePlayer(playerPendingDelete.id)}
        />
      )}
    </section>
  );
}

export default RosterPage;
