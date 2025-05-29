# Module Management Community

A community-driven module management extension for Jahia, providing GraphQL endpoints and UI integrations for managing
Jahia modules.

## Features

- GraphQL API for module management
- UI extension for Jahia administration (TODO)
- Integration with Maven for module metadata resolution

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
- Use the UI extension in Jahia's administration interface. (TODO)

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
