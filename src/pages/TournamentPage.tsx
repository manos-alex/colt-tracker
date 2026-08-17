import { Dispatch, FormEvent, Fragment, SetStateAction, useState } from "react";
import DeleteConfirmationModal from "../components/DeleteConfirmationModal";
import { mergeTournamentData } from "../data";
import {
  createTournamentBye,
  createTournamentGame,
  deleteTournamentDay,
  deleteTournamentScheduleItem,
  moveTournamentScheduleItem,
  selectRosteredTournamentPlayers,
  toggleTournamentPlayer as toggleApiTournamentPlayer,
  updateTournamentDayCount,
} from "../lib/api";
import { paths } from "../lib/routes";
import type { AppData, Id, Tournament, TournamentScheduleItem } from "../types";

type DataSetter = Dispatch<SetStateAction<AppData>>;
type ScheduleDropTarget = {
  dayNumber: number;
  index: number;
};
type ScheduleDeleteTarget =
  | {
      type: "schedule-item";
      item: TournamentScheduleItem;
      label: string;
    }
  | {
      type: "day";
      dayNumber: number;
      label: string;
    };

function TournamentPage({
  data,
  tournament,
  setData,
  navigate,
}: {
  data: AppData;
  tournament: Tournament;
  setData: DataSetter;
  navigate: (path: string) => void;
}) {
  return (
    <section className="page-stack">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Tournament</p>
          <h1>{tournament.name}</h1>
        </div>
        <button className="compact-button" onClick={() => navigate(paths.tournaments)}>
          Back
        </button>
      </div>

      <div className="data-entry-grid">
        <TournamentRosterPanel data={data} tournament={tournament} setData={setData} />
        <TournamentGamesPanel
          data={data}
          tournament={tournament}
          setData={setData}
          navigate={navigate}
        />
      </div>
    </section>
  );
}

function TournamentRosterPanel({
  data,
  tournament,
  setData,
}: {
  data: AppData;
  tournament: Tournament;
  setData: DataSetter;
}) {
  const selectedPlayers = new Set(
    data.tournamentPlayers
      .filter((item) => item.tournamentId === tournament.id)
      .map((item) => item.playerId),
  );
  const [error, setError] = useState("");

  const toggleTournamentPlayer = async (playerId: Id) => {
    setError("");
    try {
      const result = await toggleApiTournamentPlayer(tournament.id, playerId);
      setData((current) => mergeTournamentData(current, result.data, tournament.id));
    } catch (apiError) {
      setError(apiError instanceof Error ? apiError.message : "Unable to update tournament roster.");
    }
  };

  const selectRosteredPlayers = async () => {
    setError("");
    try {
      const result = await selectRosteredTournamentPlayers(tournament.id);
      setData((current) => mergeTournamentData(current, result.data, tournament.id));
    } catch (apiError) {
      setError(apiError instanceof Error ? apiError.message : "Unable to select rostered players.");
    }
  };

  return (
    <section className="wide-panel">
      {error && <p className="status-banner error">{error}</p>}
      <div className="detail-heading">
        <div>
          <strong>{tournament.name}</strong>
          <span>{tournament.location || "No location"}</span>
        </div>
      </div>
      <div className="section-title">
        <h2>Tournament Roster</h2>
        <button className="ghost-button compact-button" onClick={selectRosteredPlayers}>
          Select Rostered
        </button>
      </div>
      <div className="checklist tall tournament-roster-list">
        {data.players.map((player) => (
          <label key={player.id}>
            <input
              type="checkbox"
              checked={selectedPlayers.has(player.id)}
              onChange={() => toggleTournamentPlayer(player.id)}
            />
            <span>{player.name}</span>
            <em>{player.rosterPlayer ? "Rostered" : "Non-rostered"}</em>
          </label>
        ))}
      </div>
    </section>
  );
}

function TournamentGamesPanel({
  data,
  tournament,
  setData,
  navigate,
}: {
  data: AppData;
  tournament: Tournament;
  setData: DataSetter;
  navigate: (path: string) => void;
}) {
  const [opponentName, setOpponentName] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
  const [addingGameDay, setAddingGameDay] = useState<number | null>(null);
  const [draggedItemId, setDraggedItemId] = useState<Id | null>(null);
  const [dropTarget, setDropTarget] = useState<ScheduleDropTarget | null>(null);
  const [isEditingSchedule, setIsEditingSchedule] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ScheduleDeleteTarget | null>(null);
  const [deletingScheduleItemId, setDeletingScheduleItemId] = useState<Id | null>(null);
  const [deletingDayNumber, setDeletingDayNumber] = useState<number | null>(null);
  const [error, setError] = useState("");

  const scheduleItems = data.tournamentScheduleItems
    .filter((item) => item.tournamentId === tournament.id)
    .sort((a, b) => a.dayNumber - b.dayNumber || a.sortOrder - b.sortOrder);
  const dayCount = Math.max(1, tournament.dayCount, ...scheduleItems.map((item) => item.dayNumber));
  const days = Array.from({ length: dayCount }, (_, index) => index + 1);

  const addGame = async (event: FormEvent) => {
    event.preventDefault();
    if (!opponentName.trim() || addingGameDay === null) return;

    setError("");
    try {
      const result = await createTournamentGame({
        tournamentId: tournament.id,
        opponentName: opponentName.trim(),
        videoUrl: videoUrl.trim(),
        dayNumber: addingGameDay,
      });
      setData((current) => mergeTournamentData(current, result.data, tournament.id));
      setOpponentName("");
      setVideoUrl("");
      setAddingGameDay(null);
      if (result.gameId) {
        navigate(paths.game(result.gameId));
      }
    } catch (apiError) {
      setError(apiError instanceof Error ? apiError.message : "Unable to add game.");
    }
  };

  const cancelAddGame = () => {
    setOpponentName("");
    setVideoUrl("");
    setAddingGameDay(null);
  };

  const addBye = async (dayNumber: number) => {
    setError("");
    try {
      const result = await createTournamentBye(tournament.id, dayNumber);
      setData((current) => mergeTournamentData(current, result.data, tournament.id));
    } catch (apiError) {
      setError(apiError instanceof Error ? apiError.message : "Unable to add bye.");
    }
  };

  const addDay = async () => {
    setError("");
    try {
      const result = await updateTournamentDayCount(tournament.id, dayCount + 1);
      setData((current) => mergeTournamentData(current, result.data, tournament.id));
    } catch (apiError) {
      setError(apiError instanceof Error ? apiError.message : "Unable to add day.");
    }
  };

  const moveScheduleItem = async (draggedId: Id, targetDay: number, targetIndex: number) => {
    setError("");
    try {
      const result = await moveTournamentScheduleItem({
        tournamentId: tournament.id,
        scheduleItemId: draggedId,
        targetDay,
        targetIndex,
      });
      setData((current) => mergeTournamentData(current, result.data, tournament.id));
    } catch (apiError) {
      setError(apiError instanceof Error ? apiError.message : "Unable to move schedule item.");
    }
  };

  const finishDrag = () => {
    setDraggedItemId(null);
    setDropTarget(null);
  };

  const dropDraggedItem = (targetDay: number, targetIndex: number) => {
    if (!draggedItemId) return;

    const draggedItem = scheduleItems.find((item) => item.id === draggedItemId);
    const draggedDayItems = draggedItem
      ? scheduleItems.filter((item) => item.dayNumber === draggedItem.dayNumber)
      : [];
    const draggedIndex = draggedDayItems.findIndex((item) => item.id === draggedItemId);
    const adjustedTargetIndex =
      draggedItem?.dayNumber === targetDay && draggedIndex >= 0 && targetIndex > draggedIndex
        ? targetIndex - 1
        : targetIndex;

    void moveScheduleItem(draggedItemId, targetDay, adjustedTargetIndex);
    finishDrag();
  };

  const renderDropSlot = (dayNumber: number, index: number) => {
    const isActive = Boolean(
      draggedItemId &&
      dropTarget?.dayNumber === dayNumber &&
      dropTarget.index === index,
    );

    return (
      <div
        className={`schedule-drop-slot ${isActive ? "is-active" : ""}`}
        key={`drop-${dayNumber}-${index}`}
        onDragOver={(event) => {
          event.preventDefault();
          event.stopPropagation();
          if (draggedItemId) {
            setDropTarget({ dayNumber, index });
          }
        }}
        onDrop={(event) => {
          event.preventDefault();
          event.stopPropagation();
          dropDraggedItem(dayNumber, index);
        }}
      />
    );
  };

  const removeScheduleItem = async (scheduleItem: TournamentScheduleItem) => {
    if (deletingScheduleItemId) return;

    setDeletingScheduleItemId(scheduleItem.id);
    setError("");
    try {
      const result = await deleteTournamentScheduleItem(tournament.id, scheduleItem.id);
      setData((current) => mergeTournamentData(current, result.data, tournament.id));
      setDeleteTarget(null);
    } catch (apiError) {
      setError(apiError instanceof Error ? apiError.message : "Unable to remove schedule item.");
    } finally {
      setDeletingScheduleItemId(null);
    }
  };

  const removeDay = async (dayNumber: number) => {
    const dayItems = scheduleItems.filter((item) => item.dayNumber === dayNumber);
    if (dayItems.length > 0 || dayCount <= 1 || deletingDayNumber !== null) return;

    setDeletingDayNumber(dayNumber);
    setError("");
    try {
      const result = await deleteTournamentDay(tournament.id, dayNumber);
      setData((current) => mergeTournamentData(current, result.data, tournament.id));
      setDeleteTarget(null);
    } catch (apiError) {
      setError(apiError instanceof Error ? apiError.message : "Unable to remove day.");
    } finally {
      setDeletingDayNumber(null);
    }
  };

  const describeScheduleItemDelete = (
    scheduleItem: TournamentScheduleItem,
    game: AppData["games"][number] | null,
  ) => {
    if (game) {
      return `the game vs ${game.opponentName} from ${tournament.name}`;
    }

    return `${scheduleItem.label ?? "Bye"} from ${tournament.name}`;
  };

  const confirmDeleteTarget = () => {
    if (!deleteTarget) return;

    if (deleteTarget.type === "schedule-item") {
      void removeScheduleItem(deleteTarget.item);
      return;
    }

    void removeDay(deleteTarget.dayNumber);
  };

  return (
    <section className="wide-panel">
      {error && <p className="status-banner error">{error}</p>}
      <div className="panel-heading">
        <h2>Schedule</h2>
        <button
          className={isEditingSchedule ? "primary-button compact-button" : "ghost-button compact-button"}
          onClick={() => setIsEditingSchedule((current) => !current)}
        >
          {isEditingSchedule ? "Done" : "Edit"}
        </button>
      </div>
      {addingGameDay !== null ? (
        <form className="picker-create-row schedule-game-form" onSubmit={addGame}>
          <span className="form-context">Day {addingGameDay}</span>
          <input
            value={opponentName}
            onChange={(event) => setOpponentName(event.target.value)}
            placeholder="Opponent"
          />
          <input
            value={videoUrl}
            onChange={(event) => setVideoUrl(event.target.value)}
            placeholder="YouTube URL"
          />
          <button type="submit">Save</button>
          <button type="button" className="ghost-button" onClick={cancelAddGame}>
            Cancel
          </button>
        </form>
      ) : (
        <div className="tournament-schedule">
          {days.map((dayNumber) => {
            const dayItems = scheduleItems.filter((item) => item.dayNumber === dayNumber);

            return (
              <section
                className={`schedule-day ${draggedItemId ? "is-drop-target" : ""}`}
                key={dayNumber}
                onDragOver={(event) => {
                  event.preventDefault();
                  if (draggedItemId && event.target === event.currentTarget) {
                    setDropTarget({ dayNumber, index: dayItems.length });
                  }
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  const target =
                    dropTarget?.dayNumber === dayNumber
                      ? dropTarget
                      : { dayNumber, index: dayItems.length };
                  dropDraggedItem(target.dayNumber, target.index);
                }}
              >
                <div className="schedule-day-heading">
                  <h3>Day {dayNumber}</h3>
                  {isEditingSchedule && (
                    <button
                      className="ghost-button compact-button"
                      disabled={dayItems.length > 0 || dayCount <= 1 || deletingDayNumber === dayNumber}
                      onClick={() =>
                        setDeleteTarget({
                          type: "day",
                          dayNumber,
                          label: `Day ${dayNumber} from ${tournament.name}`,
                        })
                      }
                    >
                      {deletingDayNumber === dayNumber ? "Removing" : "Remove Day"}
                    </button>
                  )}
                </div>
                <div
                  className="selection-list"
                  onDragOver={(event) => {
                    event.preventDefault();
                    if (draggedItemId && event.target === event.currentTarget) {
                      setDropTarget({ dayNumber, index: dayItems.length });
                    }
                  }}
                >
                  {renderDropSlot(dayNumber, 0)}
                  {dayItems.map((item, index) => {
                    const game = item.gameId
                      ? data.games.find((gameItem) => gameItem.id === item.gameId) ?? null
                      : null;

                    return (
                      <Fragment key={item.id}>
                        <div
                          className={[
                            "selection-row",
                            "schedule-row",
                            item.type === "bye" ? "bye-row" : "",
                            isEditingSchedule ? "is-editing" : "",
                            draggedItemId === item.id ? "is-dragging" : "",
                          ]
                            .filter(Boolean)
                            .join(" ")}
                          draggable
                          onClick={() => {
                            if (game && !isEditingSchedule) {
                              navigate(paths.game(game.id));
                            }
                          }}
                          onKeyDown={(event) => {
                            if (
                              game &&
                              !isEditingSchedule &&
                              (event.key === "Enter" || event.key === " ")
                            ) {
                              event.preventDefault();
                              navigate(paths.game(game.id));
                            }
                          }}
                          role="button"
                          tabIndex={0}
                          onDragOver={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            if (!draggedItemId) return;

                            const rect = event.currentTarget.getBoundingClientRect();
                            const targetIndex =
                              event.clientY < rect.top + rect.height / 2 ? index : index + 1;
                            setDropTarget({ dayNumber, index: targetIndex });
                          }}
                          onDrop={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            const target =
                              dropTarget?.dayNumber === dayNumber
                                ? dropTarget
                                : { dayNumber, index };
                            dropDraggedItem(target.dayNumber, target.index);
                          }}
                          onDragStart={(event) => {
                            event.dataTransfer.effectAllowed = "move";
                            event.dataTransfer.setData("text/plain", item.id);
                            setDraggedItemId(item.id);
                            setDropTarget({ dayNumber, index });
                          }}
                          onDragEnd={finishDrag}
                        >
                        <span>
                          <strong>{game ? `vs ${game.opponentName}` : item.label ?? "Bye"}</strong>
                          <em>
                            {game
                              ? game.videoUrl
                                ? "YouTube linked"
                                : "No video URL"
                              : "Bye round"}
                          </em>
                        </span>
                        <b>{game ? `${game.ourScore}-${game.opponentScore}` : "Bye"}</b>
                        {isEditingSchedule && (
                          <button
                            className="schedule-remove-button"
                            disabled={deletingScheduleItemId === item.id}
                            onClick={(event) => {
                              event.stopPropagation();
                              setDeleteTarget({
                                type: "schedule-item",
                                item,
                                label: describeScheduleItemDelete(item, game),
                              });
                            }}
                          >
                            {deletingScheduleItemId === item.id ? "Removing" : "Remove"}
                          </button>
                        )}
                      </div>
                      {renderDropSlot(dayNumber, index + 1)}
                    </Fragment>
                    );
                  })}
                </div>
                {isEditingSchedule && (
                  <div className="schedule-actions">
                    <button onClick={() => setAddingGameDay(dayNumber)}>Add Game</button>
                    <button className="ghost-button" onClick={() => addBye(dayNumber)}>
                      Add Bye
                    </button>
                  </div>
                )}
              </section>
            );
          })}
          {isEditingSchedule && (
            <button className="ghost-button compact-button add-day-button" onClick={addDay}>
              Add Day
            </button>
          )}
        </div>
      )}
      {deleteTarget && (
        <DeleteConfirmationModal
          itemName={deleteTarget.label}
          isConfirming={
            deleteTarget.type === "schedule-item"
              ? deletingScheduleItemId === deleteTarget.item.id
              : deletingDayNumber === deleteTarget.dayNumber
          }
          onCancel={() => setDeleteTarget(null)}
          onConfirm={confirmDeleteTarget}
        />
      )}
    </section>
  );
}

export default TournamentPage;
