/* eslint-disable react-hooks/rules-of-hooks */

"use client";

import dynamic from "next/dynamic";
import "@tldraw/tldraw/tldraw.css";
import {
  BaseBoxShapeUtil,
  Geometry2d,
  HTMLContainer,
  Rectangle2d,
  ShapeUtil,
  TLBaseShape,
  TLEmbedShape,
  TLImageShape,
  TLShapeUtilFlag,
  toDomPrecision,
  useEditor,
  useExportAs,
  useIsEditing,
} from "@tldraw/tldraw";
import { getSvgAsImage } from "@/lib/getSvgAsImage";
import { blobToBase64 } from "@/lib/blobToBase64";
import React, { useEffect, useState } from "react";
import ReactDOM from "react-dom";
import { PreviewModal } from "@/components/PreviewModal";
import { format } from "path";
import { type } from "os";
import { start } from "repl";
import { json } from "stream/consumers";

type PreviewShapeType = TLBaseShape<
  "preview",
  {
    html: string;
    w: number;
    h: number;
  }
>;

class PreviewShape extends BaseBoxShapeUtil<PreviewShapeType> {
  static override type = "preview" as const;

  getDefaultProps(): PreviewShapeType["props"] {
    return {
      html: "",
      w: (960 * 2) / 3,
      h: (540 * 2) / 3,
    };
  }

  override canEdit = () => true;
  override isAspectRatioLocked = (_shape: PreviewShapeType) => false;
  override canResize = (_shape: PreviewShapeType) => true;
  override canBind = (_shape: PreviewShapeType) => false;

  override component(shape: PreviewShapeType) {
    const isEditing = useIsEditing(shape.id);
    return (
      <HTMLContainer className="tl-embed-container" id={shape.id}>
        <iframe
          className="tl-embed"
          srcDoc={shape.props.html}
          width={toDomPrecision(shape.props.w)}
          height={toDomPrecision(shape.props.h)}
          draggable={false}
          style={{
            border: 0,
            pointerEvents: isEditing ? "auto" : "none",
          }}
        />
      </HTMLContainer>
    );
  }

  indicator(shape: PreviewShapeType) {
    return <rect width={shape.props.w} height={shape.props.h} />;
  }
}

const Tldraw = dynamic(async () => (await import("@tldraw/tldraw")).Tldraw, {
  ssr: false,
});

const shapeUtils = [PreviewShape];

export default function Home() {
  // const [html, setHtml] = useState<null | string>(null);

  // useEffect(() => {
  //   const listener = (e: KeyboardEvent) => {
  //     if (e.key === "Escape") {
  //       setHtml(null);
  //     }
  //   };
  //   window.addEventListener("keydown", listener);

  //   return () => {
  //     window.removeEventListener("keydown", listener);
  //   };
  // });

  return (
    <>
      <div className={`w-screen h-screen`}>
        <Tldraw persistenceKey="tldraw" shapeUtils={shapeUtils}>
          <ExportButton /*setHtml={setHtml}*/ />
        </Tldraw>
      </div>
      {/* {html &&
        ReactDOM.createPortal(
          <div
            className="fixed top-0 left-0 right-0 bottom-0 flex justify-center items-center"
            style={{ zIndex: 2000, backgroundColor: "rgba(0,0,0,0.5)" }}
            onClick={() => setHtml(null)}
          >
            <PreviewModal html={html} setHtml={setHtml} />
          </div>,
          document.body
        )} */}
    </>
  );
}

function ExportButton(/*{ setHtml }: { setHtml: (html: string) => void }*/) {
  const editor = useEditor();
  const [loading, setLoading] = useState(false);
  const exportAs = useExportAs();
  const [key, setKey] = useState("");

  // A tailwind styled button that is pinned to the bottom right of the screen
  return (
    <div
      className="fixed bottom-4 right-4 flex items-center gap-2"
      style={{ zIndex: 1000 }}
    >
      <div className="relative">
        <div className="relative bg-white rounded-full w-6 h-6 flex justify-center items-center border hover:bg-gray-100 group">
          <svg
            className="w-4 h-4 text-gray-400"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth="2"
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="12" y1="16" x2="12" y2="12"></line>
            <line x1="12" y1="8" x2="12.01" y2="8"></line>
          </svg>
          <div className="absolute bg-white rounded-lg p-4 shadow-lg hidden group-hover:flex w-fit bottom-7">
            <p className="text-sm text-gray-700 w-full whitespace-nowrap">
              {"We don't see or save this."}
            </p>
          </div>
        </div>
      </div>
      <input
        type="password"
        placeholder="GPT API Key"
        className={`bg-white border-2 rounded-lg px-4 py-2 w-30 ${
          key === "" ? "border-blue-500" : "border-gray-300"
        }`}
        value={key}
        onChange={(e) => setKey(e.target.value)}
      />

      <button
        onClick={async (e) => {
          setLoading(true);
          try {
            e.preventDefault();

            if (editor.selectedShapes.length === 0) {
              alert(
                "No shapes selected. Select some shapes to 'make real' first :)"
              );
              return;
            }

            const previewPosition = editor.selectedShapes.reduce(
              (acc, shape) => {
                const bounds = editor.getShapePageBounds(shape);
                const right = bounds?.maxX ?? 0;
                const top = bounds?.minY ?? 0;
                return {
                  x: Math.max(acc.x, right),
                  y: Math.min(acc.y, top),
                };
              },
              { x: 0, y: Infinity }
            );

            const previousPreviews = editor.selectedShapes.filter((shape) => {
              return shape.type === "preview";
            }) as PreviewShapeType[];

            if (previousPreviews.length > 1) {
              alert(
                "Currently, you can only give GPT one previous design to work with.\nWant to make this a feature? Open a PR on our fork!\ngithub.com/tldraw/draw-a-ui"
              );
              throw new Error(
                "Currently, you can only give GPT one previous design to work with.\nWant to make this a feature? Open a PR on our fork!\ngithub.com/tldraw/draw-a-ui"
              );
            }

            const previousHtml =
              previousPreviews.length === 1
                ? previousPreviews[0].props.html
                : "No previous design has been provided this time.";

            const svg = await editor.getSvg(editor.selectedShapeIds);
            if (!svg) {
              return;
            }

            const png = await getSvgAsImage(svg, {
              type: "png",
              quality: 1,
              scale: 1,
            });
            const dataUrl = await blobToBase64(png!);

            const keyBody = key !== "" ? { key } : {};
            const resp = await fetch("/api/toHtml", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                image: dataUrl,
                html: previousHtml,
                ...keyBody,
              }),
            });

            const json = await resp.json();

            if (json.error) {
              alert("Error from open ai: " + JSON.stringify(json.error));
              return;
            }

            const message = json.choices[0].message.content;
            const start = message.indexOf("<!DOCTYPE html>");
            const end = message.indexOf("</html>");
            const html = message.slice(start, end + "</html>".length);

            editor.createShape<PreviewShapeType>({
              type: "preview",
              x: previewPosition.x,
              y: previewPosition.y,
              props: { html },
            });
          } finally {
            setLoading(false);
          }
        }}
        className=" bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded"
      >
        {loading ? (
          <div className="flex justify-center items-center relative h-4 w-4">
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
          </div>
        ) : (
          "Make real"
        )}
      </button>
    </div>
  );
}
