import { Dispatch, FormEvent, SetStateAction, useState } from "react";
import DeleteConfirmationModal from "../components/DeleteConfirmationModal";
import { createTournament, deleteTournament } from "../lib/api";
import { paths } from "../lib/routes";
import type { AppData, Id, Tournament } from "../types";

type DataSetter = Dispatch<SetStateAction<AppData>>;
const stateAbbreviations = [
  "AL",
  "AK",
  "AZ",
  "AR",
  "CA",
  "CO",
  "CT",
  "DE",
  "FL",
  "GA",
  "HI",
  "ID",
  "IL",
  "IN",
  "IA",
  "KS",
  "KY",
  "LA",
  "ME",
  "MD",
  "MA",
  "MI",
  "MN",
  "MS",
  "MO",
  "MT",
  "NE",
  "NV",
  "NH",
  "NJ",
  "NM",
  "NY",
  "NC",
  "ND",
  "OH",
  "OK",
  "OR",
  "PA",
  "RI",
  "SC",
  "SD",
  "TN",
  "TX",
  "UT",
  "VT",
  "VA",
  "WA",
  "WV",
  "WI",
  "WY",
];

function TournamentsPage({
  data,
  gameCounts,
  setData,
  setGameCounts,
  navigate,
}: {
  data: AppData;
  gameCounts: Record<Id, number>;
  setData: DataSetter;
  setGameCounts: Dispatch<SetStateAction<Record<Id, number>>>;
  navigate: (path: string) => void;
}) {
  const [name, setName] = useState("");
  const [location, setLocation] = useState("");
  const [isAddingTournament, setIsAddingTournament] = useState(false);
  const [isEditingTournaments, setIsEditingTournaments] = useState(false);
  const [isSavingTournament, setIsSavingTournament] = useState(false);
  const [tournamentPendingDelete, setTournamentPendingDelete] = useState<Tournament | null>(null);
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
      setData((current) => ({
        ...current,
        tournaments: [...current.tournaments, result.tournament],
      }));
      setGameCounts((current) => ({ ...current, [result.tournament.id]: 0 }));
      setName("");
      setLocation("");
      setIsAddingTournament(false);

      navigate(paths.tournament(result.tournament));
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
      await deleteTournament(tournament.id);
      setData((current) => removeTournamentFromData(current, tournament.id));
      setGameCounts((current) => {
        const next = { ...current };
        delete next[tournament.id];
        return next;
      });
      setTournamentPendingDelete(null);
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
            <select
              value={location}
              onChange={(event) => setLocation(event.target.value)}
              aria-label="Location"
            >
              <option value="">Location</option>
              {stateAbbreviations.map((state) => (
                <option key={state} value={state}>
                  {state}
                </option>
              ))}
            </select>
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
                const gameCount = gameCounts[tournament.id] ?? 0;

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
                          setTournamentPendingDelete(tournament);
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
      {tournamentPendingDelete && (
        <DeleteConfirmationModal
          itemName={tournamentPendingDelete.name}
          isConfirming={deletingTournamentId === tournamentPendingDelete.id}
          onCancel={() => setTournamentPendingDelete(null)}
          onConfirm={() => void removeTournament(tournamentPendingDelete)}
        />
      )}
    </section>
  );
}

export default TournamentsPage;

function removeTournamentFromData(data: AppData, tournamentId: Id): AppData {
  const gameIds = new Set(
    data.games.filter((game) => game.tournamentId === tournamentId).map((game) => game.id),
  );
  const pointIds = new Set(
    data.points.filter((point) => gameIds.has(point.gameId)).map((point) => point.id),
  );

  return {
    players: data.players,
    tournaments: data.tournaments.filter((item) => item.id !== tournamentId),
    tournamentPlayers: data.tournamentPlayers.filter((item) => item.tournamentId !== tournamentId),
    tournamentScheduleItems: data.tournamentScheduleItems.filter(
      (item) => item.tournamentId !== tournamentId,
    ),
    games: data.games.filter((game) => !gameIds.has(game.id)),
    points: data.points.filter((point) => !gameIds.has(point.gameId)),
    pointPlayers: data.pointPlayers.filter((item) => !pointIds.has(item.pointId)),
    events: data.events.filter((event) => !gameIds.has(event.gameId)),
  };
}
