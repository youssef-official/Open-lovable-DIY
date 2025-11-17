"use client";

import { Sandpack } from "@codesandbox/sandpack-react";

interface PreviewProps {
  code: string;
}

const Preview = ({ code }: PreviewProps) => {
  return (
    <Sandpack
      template="react"
      files={{
        "/App.js": code,
      }}
      theme="light"
      options={{
        editorHeight: "60vh",
        editorWidthPercentage: 50,
        showTabs: true,
        showLineNumbers: true,
      }}
    />
  );
};

export default Preview;
