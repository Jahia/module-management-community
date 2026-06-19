# Module Management Community

A community-driven module management extension for Jahia, providing GraphQL endpoints and UI integrations for managing
Jahia modules.

## Features

- GraphQL API for module management
- UI extension for Jahia administration with column filtering
- Integration with Maven for module metadata resolution

![column-filtering.png](docs/column-filtering.png)

## Technologies

- Java
- Maven

## Getting Started

### Prerequisites

- Java 11+
- Node.js (v18+)
- Yarn
- Maven

## How to deploy
Build the project using Maven:

```sh
mvn clean install
```
Deploy the built bundle to your Jahia instance via the module management UI.

### Deploy on Docker
Deploy the built bundle to your Jahia instance with Docker:

```sh
mvn clean install jahia:deploy -Djahia.deploy.targetContainerName="jahia"
```

## Usage

- Deploy the built module to your Jahia instance.
- Access the GraphQL API for module management operations.
- Use the UI extension in Jahia's administration interface at `/jahia/administration/module-management-community`.

## Column Filtering

The modules table provides interactive, client-side column filters that narrow down the list without a page reload.

### Module Name filter

A free-text input in the **Module name** column header filters rows by bundle symbolic name (case-insensitive, substring match).

```
┌─────────────────────────────┐
│ Module name ↑               │
│ [Filter by symbolic name…]  │
└─────────────────────────────┘
```

Typing `dashboard` will keep only rows whose symbolic name contains `dashboard`.

### Type filter

A dropdown in the **Type** column header filters rows by bundle type.

| Option | Behaviour |
|--------|-----------|
| **Jahia modules** *(default)* | Shows only Jahia module types: `module`, `system`, `templatesSet`. Plain OSGi bundles are hidden. |
| **All** | Shows every installed bundle regardless of type. |
| **module** | Shows only bundles of type `module`. |
| **system** | Shows only bundles of type `system`. |
| **bundle** | Shows only plain OSGi bundles. |
| **templatesSet** | Shows only bundles of type `templatesSet`. |

Changing the type filter resets the pagination back to page 1.

### Updates Only toggle

When at least one update is available, the **Available version** column header displays a toggle switch labelled *Updates only*. Enabling it hides every module that has neither a direct update nor a dependent-module update available, making it easy to focus on what needs upgrading.

> **Note:** All three filters (name, type, updates-only) are applied simultaneously, so only rows that satisfy every active filter are shown.

![column-filtering.png](docs/column-filtering.png)

## GraphQL API
The module provides a GraphQL API for managing Jahia modules. You can query and mutate module data using the provided endpoints.
### Example
```graphql
mutation {
  admin {
    modulesManagement {
      updateModules
    }
  }
}
```

### Available Queries and Mutations
- **availableUpdates**(filters: [String]): [String]
  - Return a list of modules that have updates available

- **bundle**(name: String) : GqlBundle 
  - Return different information about a bundle

- **clustered**: Boolean
  - Return true if the Jahia instance is clustered

- **installedModules**: [String]
  - Return a list of installed modules in the Jahia community edition

- **lastUpdateTime**: String
  - Return the last time the module updates were checked
#### example
```graphql
query bundleInformation {
  admin {
    modulesManagement {
      bundle(name: "augmented-search") {
        symbolicName
        bundleId
        state
        version
        dependencies
        dependenciesGraph
        manifest {
            key
            value
        }
        moduleDependencies
        moduleDependenciesGraph
        services
        servicesInUse
        sitesDeployment {
            siteKey
            deployed
        }				
        clusterState
        clusterDeployment {
            nodeId
            bundles {
                key
                state
            }
        }
        clusterState
      }
    }
  }
}
query listModules {
  admin {
    modulesManagement {
      installedModules
    }
  }
}
```
moduleDependenciesGraph and dependenciesGraph fields return a JSON string representing the graph of dependencies as a MermaidJS.


## Documentation
updateModules: Update the modules in the Jahia instance.
```graphql
mutation {
  admin {
    modulesManagement {
      updateModules(jahiaOnly: false, dryRun: true,
        filters:["jcontent", ".*dashboard.*"])
    }
  }
}
```
Arguments:
- `jahiaOnly`: If true, only updates Jahia modules.
- `dryRun`: If true, performs a dry run without applying changes.
- `filters`: An array of regex patterns to filter modules by name.


## Contributing

Contributions are welcome! Please open issues or submit pull requests.

## License

[MIT](LICENSE)

## Maintainers

- [Jahia Community](https://github.com/Jahia/moduleManagementCommunity)
