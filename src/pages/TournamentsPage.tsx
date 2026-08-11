import { Dispatch, FormEvent, SetStateAction, useState } from "react";
import { paths } from "../lib/routes";
import type { AppData, Tournament } from "../types";

type DataSetter = Dispatch<SetStateAction<AppData>>;

const now = () => new Date().toISOString();
const id = () => crypto.randomUUID();

function TournamentsPage({
  data,
  setData,
  navigate,
}: {
  data: AppData;
  setData: DataSetter;
  navigate: (path: string) => void;
}) {
  const [name, setName] = useState("");
  const [location, setLocation] = useState("");
  const [isAddingTournament, setIsAddingTournament] = useState(false);

  const addTournament = (event: FormEvent) => {
    event.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) return;

    const timestamp = now();
    const tournament: Tournament = {
      id: id(),
      name: trimmedName,
      location: location.trim(),
      startDate: "",
      endDate: "",
      dayCount: 1,
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    setData((current) => ({
      ...current,
      tournaments: [...current.tournaments, tournament],
    }));
    setName("");
    setLocation("");
    setIsAddingTournament(false);
    navigate(paths.tournament(tournament));
  };

  const cancelAddTournament = () => {
    setName("");
    setLocation("");
    setIsAddingTournament(false);
  };

  return (
    <section className="page-stack">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Tournaments</p>
          <h1>Select Tournament</h1>
        </div>
      </div>

      <section className="wide-panel">
        <div className="panel-heading">
          <h2>Tournaments</h2>
          <span>{data.tournaments.length}</span>
        </div>
        {isAddingTournament ? (
          <form className="picker-create-row" onSubmit={addTournament}>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Name"
            />
            <input
              value={location}
              onChange={(event) => setLocation(event.target.value)}
              placeholder="Location"
            />
            <button type="submit">Save</button>
            <button type="button" className="ghost-button" onClick={cancelAddTournament}>
              Cancel
            </button>
          </form>
        ) : (
          <>
            <div className="list-action-row">
              <span>Select a tournament</span>
              <button onClick={() => setIsAddingTournament(true)}>Add New</button>
            </div>
            <div className="selection-list">
              {data.tournaments.map((tournament) => {
                const gameCount = data.games.filter(
                  (game) => game.tournamentId === tournament.id,
                ).length;

                return (
                  <button
                    className="selection-row"
                    key={tournament.id}
                    onClick={() => navigate(paths.tournament(tournament))}
                  >
                    <span>
                      <strong>{tournament.name}</strong>
                      <em>{tournament.location || "No location"}</em>
                    </span>
                    <b>{gameCount} games</b>
                  </button>
                );
              })}
            </div>
          </>
        )}
      </section>
    </section>
  );
}

export default TournamentsPage;
