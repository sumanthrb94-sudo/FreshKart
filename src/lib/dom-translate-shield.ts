/**
 * Browser Translation Resilience Shield
 *
 * Protects React's reconciliation engine from crashing when browser translation
 * tools (like Google Chrome Translate on Android, edge translate, etc.) modify
 * the DOM by injecting <font> tags or restructuring text nodes.
 *
 * Prevents:
 *   "NotFoundError: Failed to execute 'insertBefore' on 'Node': The node before
 *    which the new node is to be inserted is not a child of this node."
 *   "NotFoundError: Failed to execute 'removeChild' on 'Node': The node to be
 *    removed is not a child of this node."
 *   "NotFoundError: Failed to execute 'replaceChild' on 'Node': The node to be
 *    replaced is not a child of this node."
 */

export function installDomTranslateShield(): void {
  if (typeof window === "undefined" || !window.Node || !Node.prototype) return;

  const win = window as unknown as { __DOM_TRANSLATE_SHIELD_INSTALLED__?: boolean };
  if (win.__DOM_TRANSLATE_SHIELD_INSTALLED__) return;
  win.__DOM_TRANSLATE_SHIELD_INSTALLED__ = true;

  const originalInsertBefore = Node.prototype.insertBefore;
  Node.prototype.insertBefore = function <T extends Node>(newNode: T, referenceNode: Node | null): T {
    if (referenceNode && referenceNode.parentNode !== this) {
      // Find if referenceNode is a descendant of `this` (e.g. wrapped by Google Translate in <font>)
      let ancestor = referenceNode.parentNode;
      while (ancestor && ancestor.parentNode !== this) {
        ancestor = ancestor.parentNode;
      }
      if (ancestor && ancestor.parentNode === this) {
        return originalInsertBefore.call(this, newNode, ancestor) as T;
      }
      // If referenceNode has been detached or moved elsewhere, append to keep UI rendered
      return this.appendChild(newNode) as T;
    }
    return originalInsertBefore.call(this, newNode, referenceNode) as T;
  };

  const originalRemoveChild = Node.prototype.removeChild;
  Node.prototype.removeChild = function <T extends Node>(child: T): T {
    if (child && child.parentNode !== this) {
      if (child.parentNode) {
        return child.parentNode.removeChild(child) as T;
      }
      return child;
    }
    return originalRemoveChild.call(this, child) as T;
  };

  const originalReplaceChild = Node.prototype.replaceChild;
  Node.prototype.replaceChild = function <T extends Node>(newChild: Node, oldChild: T): T {
    if (oldChild && oldChild.parentNode !== this) {
      let ancestor = oldChild.parentNode;
      while (ancestor && ancestor.parentNode !== this) {
        ancestor = ancestor.parentNode;
      }
      if (ancestor && ancestor.parentNode === this) {
        return originalReplaceChild.call(this, newChild, ancestor) as T;
      }
      return this.appendChild(newChild) as unknown as T;
    }
    return originalReplaceChild.call(this, newChild, oldChild) as T;
  };
}
