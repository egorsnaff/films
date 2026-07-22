import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { PosterImage } from "./PosterImage";

describe("PosterImage", () => {
  it("shows a loading stage until the poster image finishes loading", () => {
    render(<PosterImage src="https://example.test/poster.jpg" alt="Постер фильма" />);

    const shell = screen.getByAltText("Постер фильма").closest(".poster-image");
    expect(shell).toHaveAttribute("data-poster-state", "loading");
    expect(shell?.querySelector(".poster-image__stage")).toBeInTheDocument();

    fireEvent.load(screen.getByAltText("Постер фильма"));

    expect(shell).toHaveAttribute("data-poster-state", "loaded");
    expect(shell).toHaveClass("poster-image--loaded");
  });

  it("marks the poster as failed when the image cannot be loaded", () => {
    render(<PosterImage src="https://example.test/missing.jpg" alt="Битый постер" />);

    fireEvent.error(screen.getByAltText("Битый постер"));

    const shell = screen.getByAltText("Битый постер").closest(".poster-image");
    expect(shell).toHaveAttribute("data-poster-state", "error");
    expect(shell).toHaveClass("poster-image--error");
  });

  it("upgrades kp_small poster urls before loading the image", () => {
    render(
      <PosterImage
        src="https://kinopoiskapiunofficial.tech/images/posters/kp_small/346.jpg"
        alt="12 разгневанных мужчин"
      />
    );

    expect(screen.getByAltText("12 разгневанных мужчин")).toHaveAttribute(
      "src",
      "https://kinopoiskapiunofficial.tech/images/posters/kp/346.jpg"
    );
  });
});
