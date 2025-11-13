export interface TemplateVariables {
  [key: string]: string;
}

/**
 * Renders a template with variables using simple string replacement
 * Variables are in the format {{ variable_name }}
 */
export function renderTemplate(templateContent: string, variables: TemplateVariables): string {
  try {
    let result = templateContent;
    
    // Replace all {{variable}} with the actual values
    for (const [key, value] of Object.entries(variables)) {
      const regex = new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, 'g');
      result = result.replace(regex, value || '');
    }
    
    return result;
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

