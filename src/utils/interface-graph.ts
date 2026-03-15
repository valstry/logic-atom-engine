import { extractInterfaceHandles } from './search-query';

export interface InterfaceGraphNode {
  handle: string;
  weight: number;
  paragraphs: number[];
  neighbors: string[];
}

export interface InterfaceGraph {
  nodes: InterfaceGraphNode[];
  paragraphSummaries: Array<{
    index: number;
    handles: string[];
    preview: string;
  }>;
  topHandles: string[];
}

function splitParagraphs(input: string): string[] {
  return (input || '')
    .split(/\n{2,}/)
    .map(block => block.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

function clipPreview(text: string, maxLength: number = 80): string {
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
}

export function buildInterfaceGraph(input: string): InterfaceGraph {
  const paragraphs = splitParagraphs(input);
  const nodeMap = new Map<string, { weight: number; paragraphs: Set<number>; neighbors: Set<string> }>();
  const paragraphSummaries: InterfaceGraph['paragraphSummaries'] = [];

  paragraphs.forEach((paragraph, index) => {
    const handles = extractInterfaceHandles(paragraph, 5);
    paragraphSummaries.push({
      index,
      handles,
      preview: clipPreview(paragraph),
    });

    for (const handle of handles) {
      if (!nodeMap.has(handle)) {
        nodeMap.set(handle, {
          weight: 0,
          paragraphs: new Set<number>(),
          neighbors: new Set<string>(),
        });
      }
      const node = nodeMap.get(handle)!;
      node.weight += 1;
      node.paragraphs.add(index);
    }

    for (let i = 0; i < handles.length; i++) {
      for (let j = i + 1; j < handles.length; j++) {
        const left = nodeMap.get(handles[i]);
        const right = nodeMap.get(handles[j]);
        left?.neighbors.add(handles[j]);
        right?.neighbors.add(handles[i]);
      }
    }
  });

  const nodes: InterfaceGraphNode[] = Array.from(nodeMap.entries())
    .map(([handle, node]) => ({
      handle,
      weight: node.weight,
      paragraphs: Array.from(node.paragraphs).sort((a, b) => a - b),
      neighbors: Array.from(node.neighbors).sort(),
    }))
    .sort((a, b) => b.weight - a.weight || a.handle.localeCompare(b.handle))
    .slice(0, 24);

  return {
    nodes,
    paragraphSummaries,
    topHandles: nodes.slice(0, 6).map(node => node.handle),
  };
}

export function summarizeInterfaceGraph(graph: InterfaceGraph, maxNodes: number = 6, maxParagraphs: number = 3): string {
  const nodeLines = graph.nodes.slice(0, maxNodes).map((node, index) => {
    const neighborText = node.neighbors.slice(0, 3).join('、') || '无';
    return `${index + 1}. ${node.handle} | 段落: ${node.paragraphs.map(n => n + 1).join(', ')} | 邻接: ${neighborText}`;
  });

  const paragraphLines = graph.paragraphSummaries.slice(0, maxParagraphs).map(item => {
    const handles = item.handles.join('、') || '无接口';
    return `段落${item.index + 1}: ${handles} | ${item.preview}`;
  });

  return [
    '接口图摘要：',
    ...(nodeLines.length > 0 ? nodeLines : ['- 无接口节点']),
    '',
    '段落接口分布：',
    ...(paragraphLines.length > 0 ? paragraphLines : ['- 无段落摘要']),
  ].join('\n');
}
