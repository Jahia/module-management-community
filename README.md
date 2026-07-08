# Module Management Community

A community-driven module management extension for Jahia, providing GraphQL endpoints and UI integrations for managing
Jahia modules.

## Features

- GraphQL API for module management
- UI extension for Jahia administration with column filtering
- Integration with Maven for module metadata resolution

![column-filtering.png](docs/column-filtering.png)

## Technologies

### Backend
- Java 11
- Maven
- GraphQL (graphql-java)
- OSGi Framework

### Frontend
- React 18
- Webpack 5 with Module Federation
- Apollo Client 3
- Material-UI
- @jahia/moonstone (Jahia design system)
- Mermaid (dependency visualization)
- react-i18next (internationalization)
- SCSS

## Getting Started

### Prerequisites

- Java 11
- Node.js v24.14.0
- Yarn v1.22.22
- Maven 3.6+

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

The module provides a comprehensive GraphQL API under `admin.modulesManagement` for querying and managing Jahia modules.

### Queries

**Core Queries:**
- **`installedModules(): [String]`**
  - Returns a list of all installed module symbolic names

- **`installedBundleTypes(): [String]`**
  - Returns lightweight pre-fetch data as `symbolicName:type` pairs for all bundles (improves UI performance for type filtering)

- **`availableUpdates(filters: [String]): [String]`**
  - Returns modules that have updates available; optional regex filters to narrow scope

- **`lastUpdateTime(): String`**
  - Returns the timestamp when available updates were last checked

- **`clustered(): Boolean`**
  - Returns true if the Jahia instance is clustered (Karaf Cellar enabled)

- **`bundle(name: String, version: String): GqlBundle`**
  - Returns detailed information about a specific bundle (symbolicName, bundleId, state, version, dependencies, manifest, deployment status, cluster state, etc.)

- **`features(jahiaOnly: Boolean, filters: [String]): [GqlFeature]`**
  - Returns available Karaf features; `jahiaOnly` defaults to true to show Jahia modules only

- **`storeModules(searchTerm: String): [GqlAvailableStoreModule]`**
  - Returns compatible store modules not currently installed, filtered by search term and sorted by symbolic name

- **`exportYamlPreview(types: [String], embedAll: Boolean): String`**
  - Previews the YAML provisioning script that would be generated for a snapshot export without downloading the ZIP

### Mutations

**Module Updates:**
- **`updateModules(jahiaOnly: Boolean, dryRun: Boolean, autostart: Boolean, uninstallPrevious: Boolean, forceUpdateAll: Boolean, onStartup: Boolean, filters: [String]): GqlUpdateModulesResult`**
  - Updates modules; returns list of updated modules and provisioning YAML
  - `jahiaOnly` (default: true) — updates only Jahia modules if true
  - `dryRun` (default: false) — previews changes without applying
  - `autostart` (default: false) — automatically starts bundles after update
  - `uninstallPrevious` (default: false) — removes old versions
  - `forceUpdateAll` (default: false) — forces update even if no new version available
  - `filters` — regex patterns to filter by module name

**Per-Bundle Operations:**
- **`bundle(bundleId: Long)`** returns a mutation object with:
  - `start(): String` — starts the bundle
  - `stop(): String` — stops the bundle
  - `uninstall(): String` — uninstalls the bundle
  - `refresh(): String` — refreshes the bundle
  - `enableOnSites(siteKeys: [String]): String` — enables module on specified sites
  - `disableOnSites(siteKeys: [String]): String` — disables module on specified sites

**Installation & Import:**
- **`installBundleFromStore(symbolicName: String, version: String): String`**
  - Installs a specific version of a module from the Jahia store catalogue via server-side provisioning script

- **`installStoreModules(symbolicNames: [String]): String`**
  - Installs one or more store modules (latest compatible non-SNAPSHOT version) in a single provisioning execution

- **`installBundleFromJcr(jcrPath: String): String`**
  - Installs a bundle version from JCR (useful for rollback to previous versions stored in `/module-management/bundles/`)

- **`importModule(bundleId: Long, force: Boolean): String`**
  - Imports a module from the file system into the OSGi framework

**Provisioning & Cleanup:**
- **`generateProvisioningScript(symbolicNames: [String]): String`**
  - Generates YAML provisioning script to replay given non-SNAPSHOT modules on another server

- **`cleanupJcrVersions(): String`**
  - Removes old module versions from JCR store, keeping only currently-installed and one previous version per module; returns summary

**Clustered Operations** (only when `clustered()` returns true):
- **`synchronizeBundles(): String`** — synchronizes bundles across cluster nodes
- **`pushBundles(): String`** — pushes bundle state to cluster
- **`pullBundles(): String`** — pulls bundle state from cluster

### Example Queries

```graphql
query {
  admin {
    modulesManagement {
      clustered
      installedModules
      availableUpdates(filters: ["jcontent"])
      lastUpdateTime
      bundle(name: "jcontent") {
        symbolicName
        bundleId
        state
        version
        dependencies
        dependenciesGraph
      }
    }
  }
}
```

```graphql
mutation {
  admin {
    modulesManagement {
      updateModules(
        jahiaOnly: false
        dryRun: true
        filters: ["jcontent", ".*dashboard.*"]
      ) {
        yaml
        modules
      }
    }
  }
}
```

**Note:** Fields `dependenciesGraph` and `moduleDependenciesGraph` return JSON strings representing dependency relationships as Mermaid.js syntax.


## REST API

The module exposes three REST servlets for file-based operations:

- **POST `/module-management-community/upload`** — Upload and deploy JAR files or execute YAML provisioning scripts
- **GET `/module-management-community/export`** — Export module snapshots as ZIP with provisioning metadata
- **POST `/module-management-community/import`** — Import previously exported module snapshots

All REST endpoints are gated by the `provisioningAccess` permission (see Security below).

## Security

All module management operations (GraphQL queries/mutations and REST endpoints) require the **`provisioningAccess`** permission, enforced via the OSGi authorization system:

- **Permission:** `provisioningAccess` on root path `/`
- **Configuration:** `/src/main/resources/META-INF/configurations/org.jahia.bundles.api.authorization-modulemanagementcommunity.yml`
- **Note:** These are high-privilege operations that allow bundle deployment, execution, and potential RCE. Grant carefully; typically only admins and DevOps teams should have access.

## Contributing

Contributions are welcome! Please open issues or submit pull requests.

## License

This project is dual-licensed under:

1. **GNU General Public License v3 or later (GPL-3.0-or-later)** — for open-source use
2. **Jahia Solutions Enterprise License (JSEL)** — for commercial and enterprise deployments

See [LICENSE.txt](LICENSE.txt) and [pom.xml](pom.xml) headers for full licensing terms. For commercial licensing inquiries, contact sales@jahia.com.

## Maintainers

- [Jahia Community](https://github.com/Jahia/moduleManagementCommunity)
