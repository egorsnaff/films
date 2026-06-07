import { describe, expect, it, vi } from "vitest";

import {
  createPlayerSources,
  defaultPlayerTemplates,
  players,
  resolvePlayerEmbedUrl
} from "./playerSources";

describe("createPlayerSources", () => {
  it("builds embed player URLs from configured templates", () => {
    const players = createPlayerSources(
      {
        kinopoiskId: 301,
        title: "Матрица",
        originalTitle: "The Matrix",
        year: "1999",
        posterUrl: "https://example.test/poster.jpg",
        rating: "8.5"
      },
      [
        {
          id: "custom",
          title: "Мой сервер",
          embedUrlTemplate:
            "https://watch.example.test/embed?kp={kinopoiskId}&title={title}"
        }
      ]
    );

    expect(players).toEqual([
      {
        id: "custom",
        title: "Мой сервер",
        embedUrl:
          "https://watch.example.test/embed?kp=301&title=%D0%9C%D0%B0%D1%82%D1%80%D0%B8%D1%86%D0%B0"
      }
    ]);
  });

  it("provides default players using the hometv player URLs", () => {
    expect(Object.keys(players)).toEqual([
      "Alloha",
      "Collaps",
      "VideoCDN",
      "Coll",
      "kodi",
      "HDVB",
      "Kodik",
      "Трейлер"
    ]);

    const sources = createPlayerSources(
      {
        kinopoiskId: 312,
        title: "Матрица",
        originalTitle: "The Matrix",
        year: "1999",
        posterUrl: "https://example.test/poster.jpg",
        rating: "8.5"
      },
      defaultPlayerTemplates
    );

    expect(sources).toMatchObject([
      {
        id: "alloha",
        title: "Alloha",
        embedUrl:
          "https://harald-as.newplayjj.com/?kp=312&token=e7b61f129f4a392ac4bf6726a9dd6a"
      },
      {
        id: "collaps",
        title: "Collaps",
        embedUrl: "https://api.atomics.ws/embed/kp/312"
      },
      {
        id: "videocdn",
        title: "VideoCDN",
        embedUrl:
          "https://p.lumex.space/j3mqebEPqCLB?domain=nayteruz.github.io&kp_id=312"
      },
      {
        id: "coll",
        title: "Coll"
      },
      {
        id: "kodi",
        title: "kodi"
      },
      {
        id: "hdvb",
        title: "HDVB"
      },
      {
        id: "kodik",
        title: "Kodik",
        embedUrl: "https://kodik.cc/find-player?kinopoiskID=312"
      },
      {
        id: "trailer",
        title: "Трейлер",
        embedUrl: "https://api.atomics.ws/embed/trailer-kp/312"
      }
    ]);
    expect(sources).toHaveLength(8);
    expect(sources[3].resolveEmbedUrl).toEqual(expect.any(Function));
    expect(sources[4].resolveEmbedUrl).toEqual(expect.any(Function));
    expect(sources[5].resolveEmbedUrl).toEqual(expect.any(Function));
  });

  it("resolves async player URLs with hardcoded tokens from hometv", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        json: async () => ({
          results: [{ iframe_url: "https://coll.example.test/embed" }]
        })
      })
      .mockResolvedValueOnce({
        json: async () => ({
          results: [{ link: "https://kodik.example.test/embed" }]
        })
      })
      .mockResolvedValueOnce({
        json: async () => [{ iframe_url: "https://hdvb.example.test/embed" }]
      });

    await expect(
      resolvePlayerEmbedUrl(players.Coll, 312, { fetchImpl: fetchMock })
    ).resolves.toBe("https://coll.example.test/embed");
    await expect(
      resolvePlayerEmbedUrl(players.kodi, 312, { fetchImpl: fetchMock })
    ).resolves.toBe("https://kodik.example.test/embed");
    await expect(
      resolvePlayerEmbedUrl(players.HDVB, 312, {
        fetchImpl: fetchMock,
        hdvbToken: "hdvb-token"
      })
    ).resolves.toBe("https://hdvb.example.test/embed");

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "https://api.bhcesh.me/list?token=4c250f7ac0a8c8a658c789186b9a58a5&kinopoisk_id=312"
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "https://kodikapi.com/search?token=41dd95f84c21719b09d6c71182237a25&kinopoisk_id=312"
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      "https://apivb.com/api/videos.json?id_kp=312&token=hdvb-token"
    );
  });
});
