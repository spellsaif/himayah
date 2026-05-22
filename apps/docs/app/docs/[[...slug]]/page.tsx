import React from "react";
import { source } from "@/lib/source";
import { 
  DocsPage, 
  DocsBody, 
  DocsTitle, 
  DocsDescription 
} from "fumadocs-ui/page";
import { notFound } from "next/navigation";
import defaultMdxComponents from "fumadocs-ui/mdx";
import { Tab, Tabs } from "fumadocs-ui/components/tabs";
import { Steps, Step } from "fumadocs-ui/components/steps";
import { Accordion, Accordions } from "fumadocs-ui/components/accordion";
import { TypeTable } from "fumadocs-ui/components/type-table";
import { Mermaid } from "./mermaid";

function getTextContent(node: any): string {
  if (!node) return "";
  if (typeof node === "string") return node;
  if (typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(getTextContent).join("");
  if (node.props && node.props.children) return getTextContent(node.props.children);
  return "";
}

const findMermaidCode = (node: any): { isMermaid: boolean; code: string } => {
  if (!node) return { isMermaid: false, code: "" };
  if (typeof node === "string" || typeof node === "number") return { isMermaid: false, code: "" };
  if (Array.isArray(node)) {
    for (const child of node) {
      const result = findMermaidCode(child);
      if (result.isMermaid) return result;
    }
    return { isMermaid: false, code: "" };
  }
  if (node.props) {
    const className = node.props.className || "";
    if (typeof className === "string" && className.split(" ").includes("language-mermaid")) {
      return { isMermaid: true, code: getTextContent(node.props.children).trim() };
    }
    if (node.props.children) {
      return findMermaidCode(node.props.children);
    }
  }
  return { isMermaid: false, code: "" };
};

const components = {
  ...defaultMdxComponents,
  Tab,
  Tabs,
  Steps,
  Step,
  Accordion,
  Accordions,
  TypeTable,
  pre: ({ children, ...props }: any) => {
    const { isMermaid, code } = findMermaidCode(children);
    if (isMermaid) {
      return <Mermaid code={code} />;
    }
    return <defaultMdxComponents.pre {...props}>{children}</defaultMdxComponents.pre>;
  },
};

export default async function Page({
  params,
}: {
  params: { slug?: string[] };
}) {
  const page = source.getPage(params.slug);
  
  if (!page) {
    notFound();
  }

  const MDX = page.data.body;

  return (
    <DocsPage toc={page.data.toc} full={page.data.full}>
      <DocsTitle>{page.data.title}</DocsTitle>
      <DocsDescription>{page.data.description}</DocsDescription>
      <DocsBody>
        <MDX components={components} />
      </DocsBody>
    </DocsPage>
  );
}

export async function generateStaticParams() {
  return source.generateParams();
}

export function generateMetadata({ params }: { params: { slug?: string[] } }) {
  const page = source.getPage(params.slug);
  if (!page) notFound();

  return {
    title: page.data.title,
    description: page.data.description,
  };
}
