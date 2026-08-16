import { Dispatch, FormEvent, SetStateAction, useState } from "react";
import { createTournament, deleteTournament } from "../lib/api";
import { paths } from "../lib/routes";
import type { AppData, Tournament } from "../types";

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
  const [isEditingTournaments, setIsEditingTournaments] = useState(false);
  const [isSavingTournament, setIsSavingTournament] = useState(false);
  const [deletingTournamentId, setDeletingTournamentId] = useState("");
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

  const removeTournament = async (tournament: Tournament) => {
    if (deletingTournamentId) return;

    setDeletingTournamentId(tournament.id);
    setError("");

    try {
      const result = await deleteTournament(tournament.id);
      setData(result.data);
    } catch (apiError) {
      setError(apiError instanceof Error ? apiError.message : "Unable to remove tournament.");
    } finally {
      setDeletingTournamentId("");
    }
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
          <div className="section-actions">
            <span>{data.tournaments.length}</span>
            {!isAddingTournament && (
              <button
                className={isEditingTournaments ? "primary-button compact-button" : "ghost-button compact-button"}
                onClick={() => setIsEditingTournaments((current) => !current)}
              >
                {isEditingTournaments ? "Done" : "Edit"}
              </button>
            )}
          </div>
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
                  <div
                    className={`selection-row tournament-row ${isEditingTournaments ? "is-editing" : ""}`}
                    key={tournament.id}
                    onClick={() => {
                      if (!isEditingTournaments) {
                        navigate(paths.tournament(tournament));
                      }
                    }}
                    onKeyDown={(event) => {
                      if (
                        !isEditingTournaments &&
                        (event.key === "Enter" || event.key === " ")
                      ) {
                        event.preventDefault();
                        navigate(paths.tournament(tournament));
                      }
                    }}
                    role="button"
                    tabIndex={0}
                  >
                    <span>
                      <strong>{tournament.name}</strong>
                      <em>{tournament.location || "No location"}</em>
                    </span>
                    <b>{gameCount} games</b>
                    {isEditingTournaments && (
                      <button
                        className="schedule-remove-button"
                        disabled={deletingTournamentId === tournament.id}
                        onClick={(event) => {
                          event.stopPropagation();
                          void removeTournament(tournament);
                        }}
                      >
                        {deletingTournamentId === tournament.id ? "Removing" : "Remove"}
                      </button>
                    )}
                  </div>
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
