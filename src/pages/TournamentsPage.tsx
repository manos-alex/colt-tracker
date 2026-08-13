import { Dispatch, FormEvent, SetStateAction, useState } from "react";
import { createTournament } from "../lib/api";
import { paths } from "../lib/routes";
import type { AppData } from "../types";

type DataSetter = Dispatch<SetStateAction<AppData>>;

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
  const [isSavingTournament, setIsSavingTournament] = useState(false);
  const [error, setError] = useState("");

  const addTournament = async (event: FormEvent) => {
    event.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName || isSavingTournament) return;

    setIsSavingTournament(true);
    setError("");

    try {
      const result = await createTournament({ name: trimmedName, location: location.trim() });
      setData(result.data);
      setName("");
      setLocation("");
      setIsAddingTournament(false);

      const tournament = result.data.tournaments.find((item) => item.id === result.tournamentId);
      if (tournament) {
        navigate(paths.tournament(tournament));
      }
    } catch (apiError) {
      setError(apiError instanceof Error ? apiError.message : "Unable to add tournament.");
    } finally {
      setIsSavingTournament(false);
    }
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
        {error && <p className="status-banner error">{error}</p>}
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
            <button type="submit" disabled={isSavingTournament}>
              {isSavingTournament ? "Saving" : "Save"}
            </button>
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
