import Handlebars from 'handlebars';

export interface TemplateVariables {
  [key: string]: string;
}

/**
 * Renders a template with variables using Handlebars syntax
 * Variables are in the format {{ variable_name }}
 */
export function renderTemplate(templateContent: string, variables: TemplateVariables): string {
  try {
    const template = Handlebars.compile(templateContent);
    return template(variables);
  } catch (error) {
    console.error('Template rendering error:', error);
    throw new Error('Failed to render template');
  }
}

/**
 * Extracts variable names from a template
 * Returns an array of unique variable names found in {{ }} brackets
 */
export function extractTemplateVariables(templateContent: string): string[] {
  const variableRegex = /\{\{\s*(\w+)\s*\}\}/g;
  const matches = templateContent.matchAll(variableRegex);
  const variables = Array.from(matches, match => match[1]);
  return [...new Set(variables)]; // Remove duplicates
}

/**
 * Validates that all required variables are provided
 */
export function validateTemplateVariables(
  templateContent: string,
  providedVariables: TemplateVariables
): { valid: boolean; missingVariables: string[] } {
  const requiredVariables = extractTemplateVariables(templateContent);
  const providedKeys = Object.keys(providedVariables);
  const missingVariables = requiredVariables.filter(v => !providedKeys.includes(v));

  return {
    valid: missingVariables.length === 0,
    missingVariables,
  };
}

