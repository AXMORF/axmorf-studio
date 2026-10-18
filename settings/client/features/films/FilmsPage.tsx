import { useFilms } from "../../hooks/useFilms";
import { FilmsPanel } from "./FilmsPanel";

export const FilmsPage = () => {
  const films = useFilms();
  return (
    <FilmsPanel
      list={films.list}
      status={films.status}
      error={films.error}
      refresh={films.refresh}
      deleteFilm={films.deleteFilm}
    />
  );
};
