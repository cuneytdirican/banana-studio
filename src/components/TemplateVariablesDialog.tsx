import { useState } from 'react';
import { X } from 'lucide-react';
import { applyTemplateVariables, extractTemplateVariables, missingTemplateVariables } from '../lib/prompts/templateVariables';
import type { Template } from '../types';

export const TemplateVariablesDialog = ({
  template,
  onCancel,
  onApply,
}: {
  template: Template;
  onCancel: () => void;
  onApply: (prompt: string) => void;
}) => {
  const variables = extractTemplateVariables(template.config.prompt);
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(variables.map(name => [name, ''])),
  );
  const missing = missingTemplateVariables(template.config.prompt, values);

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 p-4" role="dialog" aria-modal="true" aria-labelledby="template-variables-title">
      <form
        className="w-full max-w-md rounded-2xl border border-gray-700 bg-[#161b22] p-5 shadow-2xl"
        onSubmit={event => {
          event.preventDefault();
          if (missing.length) return;
          onApply(applyTemplateVariables(template.config.prompt, values));
        }}
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h2 id="template-variables-title" className="text-sm font-semibold text-white">Fill template variables</h2>
            <p className="mt-1 text-[11px] text-gray-500">{template.name}</p>
          </div>
          <button type="button" onClick={onCancel} aria-label="Close" className="text-gray-500 hover:text-white">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-3">
          {variables.map(name => (
            <label key={name} className="block">
              <span className="mb-1 block text-[11px] font-medium text-gray-400">{name}</span>
              <input
                value={values[name]}
                onChange={event => setValues(current => ({ ...current, [name]: event.target.value }))}
                autoFocus={name === variables[0]}
                placeholder={`Value for ${name}`}
                className="w-full rounded-lg border border-gray-700 bg-gray-900/70 px-3 py-2 text-sm text-gray-100 outline-none placeholder:text-gray-600 focus:border-violet-500/60"
              />
            </label>
          ))}
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="rounded-lg px-3 py-2 text-xs font-semibold text-gray-400 hover:text-white">
            Cancel
          </button>
          <button
            type="submit"
            disabled={missing.length > 0}
            className="rounded-lg bg-violet-600 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Apply template
          </button>
        </div>
      </form>
    </div>
  );
};
