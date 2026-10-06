// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

/**
 * SecurityChecker provides methods to validate content against security rules.
 * This class helps prevent XSS attacks by checking for potentially dangerous HTML content.
 */
export class SecurityChecker {
  /**
   * Checks if the provided text contains potentially unsafe content based on security rules.
   * @param text - The text content to check
   * @param props - Security check configuration
   * @param props.allowScriptTag - When false, throws if script tags are found
   * @throws {SecurityError} When security rules are violated
   */
  public static checkSecurity(
    text: string,
    props: { allowScriptTag: boolean },
  ) {
    if (!props.allowScriptTag && this.containsScriptTag(text)) {
      throw new SecurityError(
        "Renderer rejected the input because of insecure content: text contains script tag",
      );
    }
  }

  /**
   * Tests if the input text contains any script tags or event handlers.
   * @param text - The text to check for script tags
   * @returns true if script tags are found, false otherwise
   * @private
   */
  private static containsScriptTag(text: string): boolean {
    const patterns = [/<\s*script/i, /<script[\s\S]*?>/i, /javascript:/i];
    return (
      patterns.some((pattern) => pattern.test(text)) ||
      this.containsEventHandlerAttribute(text)
    );
  }

  /**
   * Equivalent of /<[a-z][^>]*[\s/]+on\w+\s*=/i in linear time: each `<x...` run up to `>` is
   * scanned once, instead of re-scanning it from every nested `<` (quadratic on hostile input).
   */
  private static containsEventHandlerAttribute(text: string): boolean {
    const tagPattern = /<[a-z][^>]*/gi;
    const handlerPattern = /[\s/]on\w+\s*=/i;
    for (const match of text.matchAll(tagPattern)) {
      if (handlerPattern.test(match[0].slice(2))) {
        return true;
      }
    }
    return false;
  }
}

/**
 * Error thrown when security validation fails.
 */
export class SecurityError extends Error {
  public constructor(message?: string, cause?: Error) {
    super(message);
    this.name = "SecurityError";
    if (cause) {
      this.cause = cause;
    }
  }
}
