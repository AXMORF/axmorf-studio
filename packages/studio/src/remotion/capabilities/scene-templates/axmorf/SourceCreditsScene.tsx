import type { FC } from "react";
import { AbsoluteFill, Easing, interpolate } from "remotion";
import type { VisualTheme } from "@axmorf/studio/contracts";

import {
  AXMORF_SOURCE_FOLLOW_LANDSCAPE_LINES,
  AXMORF_SOURCE_FOLLOW_MESSAGE,
  AXMORF_SOURCE_FOLLOW_PORTRAIT_LINES,
} from "./content";

const clamped = {
  extrapolateLeft: "clamp",
  extrapolateRight: "clamp",
} as const;
const messageFontSize = 48;
const messageLineHeight = 1.35;
const referenceFontSize = 36;
const referenceLineHeight = 1.25;
const referenceLinePixels = referenceFontSize * referenceLineHeight;
const referencesStartFrame = 54;
const fadeStartFrame = 104;
const gridGap = 12;
const referenceGap = 16;
const cardPadding = 12;
const fieldGap = 8;

type SourceReference = Readonly<{ title: string; url: string }>;

export type SourceCreditsSceneProps = Readonly<{
  sceneFrame: number;
  width: number;
  height: number;
  theme: VisualTheme;
  references: readonly SourceReference[];
}>;

// Explicit line boundaries reserve a conservative em for every code point. The
// layout does not depend on browser measurement, font loading, or render order.
const charactersPerLine = (width: number, fontSize: number) =>
  Math.max(1, Math.floor(width / (fontSize * 1.1)));
const characterUnits = (character: string, compactAscii: boolean) => {
  if (!compactAscii || !/^[\u0020-\u007e]$/u.test(character)) return 1;
  if (/[MWmw@%&]/u.test(character)) return 1;
  if (/[A-Z]/u.test(character)) return 0.8;
  if (/[a-z0-9]/u.test(character)) return 0.7;
  return 0.65;
};
const textUnits = (text: string) =>
  Array.from(text).reduce(
    (sum, character) => sum + characterUnits(character, true),
    0,
  );
const wrapText = (
  text: string,
  capacity: number,
  preferPunctuation = false,
  compactAscii = false,
) => {
  const characters = Array.from(text.replace(/\s+/gu, " "));
  const lines: string[] = [];
  while (characters.length > 0) {
    let end = 0;
    let units = 0;
    while (end < characters.length) {
      const nextUnits = characterUnits(characters[end], compactAscii);
      if (end > 0 && units + nextUnits > capacity) break;
      units += nextUnits;
      end++;
    }
    if (preferPunctuation && end < characters.length) {
      for (let index = end - 1; index >= Math.floor(capacity / 2); index--) {
        if (/[，。]/u.test(characters[index])) {
          end = index + 1;
          break;
        }
      }
    }
    lines.push(characters.splice(0, end).join(""));
  }
  return lines;
};
const abbreviate = (text: string, capacity: number) => {
  const characters = Array.from(text.replace(/\s+/gu, " "));
  if (textUnits(characters.join("")) <= capacity) return characters.join("");
  let end = 0;
  let units = 0;
  while (end < characters.length) {
    units += characterUnits(characters[end], true);
    if (units > capacity - 1) break;
    end++;
  }
  return `${characters.slice(0, end).join("")}…`;
};

export const SourceCreditsScene: FC<SourceCreditsSceneProps> = ({
  sceneFrame,
  width,
  height,
  theme,
  references,
}) => {
  const isLandscape = width > height;
  const paddingX = Math.round(Math.min(96, width * 0.045));
  const paddingY = Math.round(Math.min(64, height * 0.06));
  const innerWidth = width - paddingX * 2;
  const innerHeight = height - paddingY * 2;
  const messageCapacity = charactersPerLine(innerWidth, messageFontSize);
  const preferredLines = isLandscape
    ? AXMORF_SOURCE_FOLLOW_LANDSCAPE_LINES
    : AXMORF_SOURCE_FOLLOW_PORTRAIT_LINES;
  const messageLines = preferredLines.every(
    (line) => Array.from(line).length <= messageCapacity,
  )
    ? [...preferredLines]
    : wrapText(AXMORF_SOURCE_FOLLOW_MESSAGE, messageCapacity, true);
  const messageHeight =
    messageLines.length * messageFontSize * messageLineHeight;
  const messageGap = isLandscape ? 24 : 40;
  const cardColumns =
    isLandscape && innerWidth >= 1200 && references.length > 1 ? 2 : 1;
  const cardWidth = (innerWidth - gridGap * (cardColumns - 1)) / cardColumns;
  const referenceCapacity = charactersPerLine(
    cardWidth - cardPadding * 2 - 2,
    referenceFontSize,
  );
  const cardReferenceHeight = innerHeight - referenceLinePixels - referenceGap;
  const cardLineBudget = Math.max(
    2,
    Math.floor(
      (cardReferenceHeight - cardPadding * 2 - 2 - fieldGap) /
        referenceLinePixels,
    ),
  );
  const fullCards = references.map((reference, index) => {
    const titleLines = wrapText(
      abbreviate(
        reference.title,
        referenceCapacity * Math.min(3, cardLineBudget - 1),
      ),
      referenceCapacity,
      false,
      true,
    );
    const urlLineBudget = Math.min(2, cardLineBudget - titleLines.length);
    const urlCapacity = referenceCapacity * urlLineBudget;
    const urlLabel =
      textUnits(reference.url) <= urlCapacity
        ? reference.url
        : abbreviate(`${new URL(reference.url).origin}/…`, urlCapacity);
    const urlLines = wrapText(urlLabel, referenceCapacity, false, true);
    return {
      reference,
      index,
      titleLines,
      urlLines,
      height:
        cardPadding * 2 +
        2 +
        (titleLines.length + urlLines.length) * referenceLinePixels +
        (urlLines.length > 0 ? fieldGap : 0),
    };
  });
  let fullGridHeight = 0;
  for (let index = 0; index < fullCards.length; index += cardColumns) {
    fullGridHeight +=
      (index > 0 ? gridGap : 0) +
      Math.max(
        ...fullCards
          .slice(index, index + cardColumns)
          .map((card) => card.height),
      );
  }
  // Dense sources use parallel title/domain labels before pagination. At 720p
  // all eight sources fit in one reference phase; a 270px viewport fits four.
  const isList = fullGridHeight > cardReferenceHeight;
  const columns = isList ? 1 : cardColumns;
  const lineHeight = isList ? 1.2 : referenceLineHeight;
  const headingHeight = referenceFontSize * lineHeight;
  const sectionGap = isList ? 8 : referenceGap;
  const rowGap = isList ? (height < 360 ? 2 : 6) : gridGap;
  const referenceHeight = innerHeight - headingHeight - sectionGap;
  const titleWidth = (innerWidth - gridGap) * (1.2 / 2.2);
  const domainWidth = innerWidth - gridGap - titleWidth;
  const cards = isList
    ? references.map((reference, index) => ({
        reference,
        index,
        titleLines: [
          abbreviate(
            reference.title,
            charactersPerLine(titleWidth, referenceFontSize),
          ),
        ],
        urlLines: [
          abbreviate(
            new URL(reference.url).host,
            charactersPerLine(domainWidth, referenceFontSize),
          ),
        ],
        height: headingHeight + 1,
      }))
    : fullCards;
  const pages: (typeof cards)[] = [];
  let page: typeof cards = [];
  let pageHeight = 0;
  for (let index = 0; index < cards.length; index += columns) {
    const row = cards.slice(index, index + columns);
    const rowHeight = Math.max(...row.map((card) => card.height));
    if (page.length > 0 && pageHeight + rowGap + rowHeight > referenceHeight) {
      pages.push(page);
      page = [];
      pageHeight = 0;
    }
    pageHeight += (page.length > 0 ? rowGap : 0) + rowHeight;
    page.push(...row);
  }
  pages.push(page);
  const combined =
    pages.length === 1 &&
    messageHeight +
      messageGap +
      headingHeight +
      sectionGap +
      (cards.length === 0 ? referenceLinePixels : pageHeight) <=
      innerHeight;
  const showMessage = combined || sceneFrame < referencesStartFrame;
  const showReferences = combined || !showMessage;
  const referencePageFrames =
    (fadeStartFrame - referencesStartFrame) / pages.length;
  const pageIndex = combined
    ? 0
    : Math.max(
        0,
        Math.min(
          pages.length - 1,
          Math.floor((sceneFrame - referencesStartFrame) / referencePageFrames),
        ),
      );
  const pageStartFrame = referencesStartFrame + pageIndex * referencePageFrames;
  const messageLinesPerPage = Math.max(
    1,
    Math.floor(innerHeight / (messageFontSize * messageLineHeight)),
  );
  const messagePages = Math.ceil(messageLines.length / messageLinesPerPage);
  const messagePageFrames = referencesStartFrame / messagePages;
  const messagePageIndex = combined
    ? 0
    : Math.min(
        messagePages - 1,
        Math.max(0, Math.floor(sceneFrame / messagePageFrames)),
      );
  const visibleMessageLines = combined
    ? messageLines
    : messageLines.slice(
        messagePageIndex * messageLinesPerPage,
        (messagePageIndex + 1) * messageLinesPerPage,
      );
  const messageFrame = sceneFrame - messagePageIndex * messagePageFrames;

  return (
    <AbsoluteFill
      data-source-credits-stage={
        combined ? "combined" : showMessage ? "message" : "references"
      }
      data-source-credits-page={pageIndex + 1}
      data-source-credits-pages={pages.length}
      data-source-credits-layout={isList ? "list" : "cards"}
      style={{
        boxSizing: "border-box",
        color: theme.primaryText,
        justifyContent: "center",
        opacity: interpolate(sceneFrame, [104, 119], [1, 0], clamped),
        padding: `${paddingY}px ${paddingX}px`,
        width,
        height,
      }}
    >
      {showMessage ? (
        <div
          data-source-credits-message
          aria-label={AXMORF_SOURCE_FOLLOW_MESSAGE}
          role="img"
          style={{
            fontFamily:
              '"Noto Serif SC", "Source Han Serif SC", "Songti SC", serif',
            fontSize: messageFontSize,
            fontWeight: 520,
            letterSpacing: "0.045em",
            lineHeight: messageLineHeight,
            opacity: combined
              ? 1
              : interpolate(sceneFrame, [46, 54], [1, 0], clamped),
            textAlign: "center",
          }}
        >
          {visibleMessageLines.map((line, index) => {
            const start =
              (combined ? 10 : messagePages === 1 ? 6 : 0) +
              index * (combined ? 7 : 5);
            const end =
              start + (combined ? 22 : Math.min(18, messagePageFrames / 3));
            return (
              <div
                key={`${messagePageIndex}-${index}`}
                aria-hidden="true"
                style={{
                  fontSize: messageFontSize,
                  filter: `blur(${interpolate(messageFrame, [start, end], [7, 0], clamped)}px)`,
                  opacity: interpolate(messageFrame, [start, end], [0, 1], {
                    ...clamped,
                    easing: Easing.bezier(0.16, 1, 0.3, 1),
                  }),
                  translate: `0 ${interpolate(messageFrame, [start, end], [Math.min(22, paddingY), 0], clamped)}px`,
                  whiteSpace: "nowrap",
                }}
              >
                {line}
              </div>
            );
          })}
        </div>
      ) : null}
      {showReferences ? (
        <div
          data-source-credits-heading
          aria-label={`本期参考资料，第 ${pageIndex + 1} 页，共 ${pages.length} 页`}
          style={{
            color: theme.accent,
            fontFamily: 'Inter, "Noto Sans SC", Arial, sans-serif',
            fontSize: referenceFontSize,
            fontWeight: 650,
            lineHeight,
            marginTop: showMessage ? messageGap : 0,
            opacity: interpolate(
              sceneFrame,
              combined
                ? [44, 58]
                : [
                    pageStartFrame,
                    pageStartFrame + Math.min(8, referencePageFrames / 3),
                  ],
              [0, 1],
              clamped,
            ),
            textAlign: "center",
            whiteSpace: "nowrap",
          }}
        >
          本期参考资料
          {pages.length > 1 ? (
            <span
              style={{
                color: theme.secondaryText,
                fontSize: referenceFontSize,
                marginLeft: 20,
              }}
            >
              {pageIndex + 1} / {pages.length}
            </span>
          ) : null}
        </div>
      ) : null}
      {showReferences ? (
        <div
          data-source-credits-grid
          style={{
            display: "grid",
            fontFamily: 'Inter, "Noto Sans SC", Arial, sans-serif',
            fontSize: referenceFontSize,
            gap: rowGap,
            gridTemplateColumns:
              columns === 2 ? "repeat(2, minmax(0, 1fr))" : "minmax(0, 1fr)",
            lineHeight,
            marginTop: sectionGap,
            textAlign: references.length === 0 ? "center" : undefined,
            opacity: interpolate(
              sceneFrame,
              combined
                ? [54, 68]
                : [
                    pageStartFrame,
                    pageStartFrame + Math.min(8, referencePageFrames / 3),
                  ],
              [0, 1],
              clamped,
            ),
          }}
        >
          {references.length === 0
            ? "本期无外部资料引用"
            : pages[pageIndex].map(
                ({ reference, index, titleLines, urlLines }) => (
                  <div
                    key={index}
                    data-source-title={reference.title}
                    data-source-url={reference.url}
                    data-source-index={index}
                    aria-label={`${reference.title} ${reference.url}`}
                    style={{
                      border: isList
                        ? undefined
                        : `1px solid ${theme.secondaryText}`,
                      borderBottom: isList
                        ? `1px solid ${theme.secondaryText}`
                        : undefined,
                      borderRadius: isList ? undefined : 18,
                      display: isList ? "grid" : undefined,
                      gap: isList ? gridGap : undefined,
                      gridTemplateColumns: isList
                        ? "minmax(0, 1.2fr) minmax(0, 1fr)"
                        : undefined,
                      fontSize: referenceFontSize,
                      minWidth: 0,
                      padding: isList ? "0" : `${cardPadding}px`,
                    }}
                  >
                    <div
                      style={{
                        fontFamily: 'Inter, "Noto Sans SC", Arial, sans-serif',
                        fontSize: referenceFontSize,
                        fontWeight: 650,
                        lineHeight,
                      }}
                    >
                      {titleLines.map((line, lineIndex) => (
                        <div
                          key={lineIndex}
                          style={{
                            fontSize: referenceFontSize,
                            whiteSpace: "nowrap",
                          }}
                        >
                          {line}
                        </div>
                      ))}
                    </div>
                    {urlLines.length > 0 ? (
                      <div
                        style={{
                          color: theme.secondaryText,
                          direction: "ltr",
                          fontFamily: "Inter, Arial, ui-sans-serif, sans-serif",
                          fontSize: referenceFontSize,
                          lineHeight,
                          marginTop: isList ? 0 : fieldGap,
                          textAlign: "left",
                        }}
                      >
                        {urlLines.map((line, lineIndex) => (
                          <div
                            key={lineIndex}
                            style={{
                              fontSize: referenceFontSize,
                              whiteSpace: "nowrap",
                            }}
                          >
                            {line}
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ),
              )}
        </div>
      ) : null}
    </AbsoluteFill>
  );
};
