import { describe, it, expect, beforeEach } from "vitest";
import { installDomTranslateShield } from "../dom-translate-shield";

// Mock minimal DOM Node to test in Node.js environment
class MockNode {
  parentNode: MockNode | null = null;
  children: MockNode[] = [];

  appendChild<T extends MockNode>(child: T): T {
    if (child.parentNode) {
      child.parentNode.removeChild(child);
    }
    child.parentNode = this;
    this.children.push(child);
    return child;
  }

  insertBefore<T extends MockNode>(newNode: T, referenceNode: MockNode | null): T {
    if (referenceNode && referenceNode.parentNode !== this) {
      throw new Error(
        "Failed to execute 'insertBefore' on 'Node': The node before which the new node is to be inserted is not a child of this node."
      );
    }
    if (newNode.parentNode) {
      newNode.parentNode.removeChild(newNode);
    }
    newNode.parentNode = this;
    if (!referenceNode) {
      this.children.push(newNode);
      return newNode;
    }
    const idx = this.children.indexOf(referenceNode);
    this.children.splice(idx, 0, newNode);
    return newNode;
  }

  removeChild<T extends MockNode>(child: T): T {
    if (child.parentNode !== this) {
      throw new Error(
        "Failed to execute 'removeChild' on 'Node': The node to be removed is not a child of this node."
      );
    }
    const idx = this.children.indexOf(child);
    if (idx !== -1) {
      this.children.splice(idx, 1);
    }
    child.parentNode = null;
    return child;
  }
}

describe("DOM Translate Shield in Node environment", () => {
  beforeEach(() => {
    // Setup window and Node globals
    const mockGlobal = globalThis as unknown as {
      window: { Node: typeof MockNode; __DOM_TRANSLATE_SHIELD_INSTALLED__?: boolean };
      Node: typeof MockNode;
    };
    mockGlobal.window = { Node: MockNode };
    mockGlobal.Node = MockNode;
    installDomTranslateShield();
  });

  it("prevents crash on insertBefore when Google Translate wrapped referenceNode in <font>", () => {
    const parent = new MockNode();
    const originalChild = new MockNode();
    parent.appendChild(originalChild);

    // Google Translate replaces originalChild with a <font> wrapper containing originalChild
    const fontWrapper = new MockNode();
    parent.removeChild(originalChild);
    fontWrapper.appendChild(originalChild);
    parent.appendChild(fontWrapper);

    const newNode = new MockNode();

    // In unpatched DOM, parent.insertBefore(newNode, originalChild) throws because
    // originalChild.parentNode is fontWrapper, not parent.
    // The shield must intercept and safely insert before fontWrapper.
    expect(() => {
      parent.insertBefore(newNode, originalChild);
    }).not.toThrow();

    expect(newNode.parentNode).toBe(parent);
    expect(parent.children[0]).toBe(newNode);
    expect(parent.children[1]).toBe(fontWrapper);
  });

  it("prevents crash on removeChild when child is reparented", () => {
    const parent = new MockNode();
    const originalChild = new MockNode();
    parent.appendChild(originalChild);

    // Reparent into wrapper
    const fontWrapper = new MockNode();
    parent.removeChild(originalChild);
    fontWrapper.appendChild(originalChild);
    parent.appendChild(fontWrapper);

    expect(() => {
      parent.removeChild(originalChild);
    }).not.toThrow();

    expect(originalChild.parentNode).toBeNull();
    expect(fontWrapper.children.includes(originalChild)).toBe(false);
  });
});
