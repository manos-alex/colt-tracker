import { Dispatch, FormEvent, SetStateAction, useRef, useState } from "react";
import { createPlayer, deletePlayer, updatePlayer as updateApiPlayer } from "../lib/api";
import type { AppData, Id, Player } from "../types";

type DataSetter = Dispatch<SetStateAction<AppData>>;

const now = () => new Date().toISOString();

function RosterPage({ data, setData }: { data: AppData; setData: DataSetter }) {
  const [playerName, setPlayerName] = useState("");
  const [rosterPlayer, setRosterPlayer] = useState(true);
  const [isAddingPlayer, setIsAddingPlayer] = useState(false);
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

        <div className="table-list">
          <div className="table-header">
            <span>Name</span>
            <span>Rostered</span>
            <span />
          </div>
          {data.players.map((player) => (
            <div className="table-row" key={player.id}>
              <input
                value={player.name}
                onChange={(event) => updatePlayer(player.id, { name: event.target.value })}
                aria-label={`${player.name} name`}
              />
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
              <button
                className="ghost-button"
                disabled={deletingPlayerIds.has(player.id)}
                onClick={() => void removePlayer(player.id)}
              >
                {deletingPlayerIds.has(player.id) ? "Removing" : "Remove"}
              </button>
            </div>
          ))}
        </div>
      </section>
    </section>
  );
}

export default RosterPage;
