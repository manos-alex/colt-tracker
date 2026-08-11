import { Dispatch, FormEvent, SetStateAction, useState } from "react";
import type { AppData, Id, Player } from "../types";

type DataSetter = Dispatch<SetStateAction<AppData>>;

const now = () => new Date().toISOString();
const id = () => crypto.randomUUID();

function RosterPage({ data, setData }: { data: AppData; setData: DataSetter }) {
  const [playerName, setPlayerName] = useState("");
  const [rosterPlayer, setRosterPlayer] = useState(true);

  const addPlayer = (event: FormEvent) => {
    event.preventDefault();
    const name = playerName.trim();
    if (!name) return;

    const timestamp = now();
    const player: Player = {
      id: id(),
      name,
      rosterPlayer,
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    setData((current) => ({ ...current, players: [...current.players, player] }));
    setPlayerName("");
    setRosterPlayer(true);
  };

  const updatePlayer = (playerId: Id, patch: Partial<Player>) => {
    setData((current) => ({
      ...current,
      players: current.players.map((player) =>
        player.id === playerId ? { ...player, ...patch, updatedAt: now() } : player,
      ),
    }));
  };

  const removePlayer = (playerId: Id) => {
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
    }));
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
          <button type="submit">Add Player</button>
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
              <button className="ghost-button" onClick={() => removePlayer(player.id)}>
                Remove
              </button>
            </div>
          ))}
        </div>
      </section>
    </section>
  );
}

export default RosterPage;

