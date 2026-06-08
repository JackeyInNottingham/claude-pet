// Format Claude Code PermissionRequest payloads for the pet dialog

const PermissionFormat = {
  title(request) {
    if (request.title) return request.title;
    const tool = request.tool_name || request.toolName;
    if (tool) return `Allow Claude to use ${tool}?`;
    return 'Permission needed';
  },

  detail(request) {
    const tool = request.tool_name || request.toolName;
    const input = request.tool_input || request.toolInput || {};
    if (!tool) {
      return request.message || request.command || request.detail || '';
    }

    switch (tool) {
      case 'Bash':
        return input.command || input.description || JSON.stringify(input, null, 2);
      case 'Read':
      case 'Write':
      case 'Edit':
      case 'NotebookEdit':
        return input.file_path || input.filePath || input.path || input.notebook_path || JSON.stringify(input, null, 2);
      default:
        try {
          return JSON.stringify(input, null, 2);
        } catch (_) {
          return String(input);
        }
    }
  },

  suggestionLabel(suggestion, index) {
    if (suggestion.label) return suggestion.label;
    const type = suggestion.type;
    if (type === 'addRules') {
      const rules = suggestion.rules || [];
      const parts = rules.map((r) => {
        if (r.ruleContent) return `${r.toolName}(${r.ruleContent})`;
        return r.toolName || 'tool';
      });
      const dest = this.destinationLabel(suggestion.destination);
      return `Always allow ${parts.join(', ')}${dest ? ` (${dest})` : ''}`;
    }
    if (type === 'setMode') return `Always use mode: ${suggestion.mode}`;
    if (type === 'addDirectories') {
      const dirs = (suggestion.directories || []).join(', ');
      return `Allow directories: ${dirs}`;
    }
    return `Option ${index + 1}`;
  },

  destinationLabel(dest) {
    const map = {
      session: 'this session',
      localSettings: 'this project',
      projectSettings: 'project settings',
      userSettings: 'user settings'
    };
    return map[dest] || dest || '';
  },

  buildOptions(request) {
    const options = [
      { id: 'allow-once', label: 'Yes', primary: true, decision: { behavior: 'allow' } },
      { id: 'deny', label: 'No', decision: { behavior: 'deny' } }
    ];

    const suggestions = request.permission_suggestions || request.permissionSuggestions || [];
    suggestions.forEach((s, i) => {
      options.splice(options.length - 1, 0, {
        id: `suggestion-${i}`,
        label: this.suggestionLabel(s, i),
        decision: {
          behavior: 'allow',
          updatedPermissions: [s]
        }
      });
    });

    return options;
  },

  /** Demo fixtures mirroring Claude Code PermissionRequest shapes */
  demoSamples: [
    {
      requestId: 'demo-short',
      tool_name: 'Bash',
      tool_input: { command: 'npm install react', description: 'Install react package' },
      permission_suggestions: []
    },
    {
      requestId: 'demo-long',
      tool_name: 'Bash',
      tool_input: {
        command: 'curl -fsSL "https://example.com/install.sh" | bash -s -- --verbose --install-dir="/very/long/path/to/some/deep/nested/directory" --config=/etc/app/config.json'
      },
      permission_suggestions: [
        {
          type: 'addRules',
          rules: [{ toolName: 'Bash', ruleContent: 'curl:*' }],
          behavior: 'allow',
          destination: 'localSettings'
        }
      ]
    },
    {
      requestId: 'demo-multi',
      tool_name: 'Bash',
      tool_input: { command: 'rm -rf node_modules && npm ci' },
      permission_suggestions: [
        {
          type: 'addRules',
          rules: [{ toolName: 'Bash', ruleContent: 'rm -rf node_modules' }],
          behavior: 'allow',
          destination: 'session'
        },
        {
          type: 'addRules',
          rules: [{ toolName: 'Bash', ruleContent: 'npm ci' }],
          behavior: 'allow',
          destination: 'localSettings'
        },
        {
          type: 'addRules',
          rules: [{ toolName: 'Bash' }],
          behavior: 'allow',
          destination: 'userSettings'
        }
      ]
    },
    {
      requestId: 'demo-edit',
      tool_name: 'Edit',
      tool_input: { file_path: 'electron/permission-dialog.js' },
      permission_suggestions: [
        {
          type: 'addRules',
          rules: [{ toolName: 'Edit', ruleContent: 'electron/*' }],
          behavior: 'allow',
          destination: 'localSettings'
        }
      ]
    }
  ]
};

if (typeof window !== 'undefined') {
  window.PermissionFormat = PermissionFormat;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { PermissionFormat };
}
