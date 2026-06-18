package org.jahia.support.modulemanagement;

import java.util.Arrays;
import java.util.Collections;
import java.util.HashSet;
import java.util.Set;

/**
 * Options for module snapshot export.
 * Only Jahia bundles with Jahia-Module-Type of module, system or templatesSet are eligible;
 * plain OSGi bundles (type=bundle or no type) are intentionally excluded.
 */
public class ExportOptions {

    public static final Set<String> ALLOWED_TYPES =
            Collections.unmodifiableSet(new HashSet<>(Arrays.asList("module", "system", "templatesSet")));

    private final Set<String> types;

    /**
     * When {@code true} (the default), every eligible bundle's JAR file is resolved from
     * the local Maven cache or the {@code file:} location and embedded inside the ZIP.
     * The generated {@code provisioning.yaml} references them via the {@code ${archiveRoot}}
     * placeholder so the archive is fully self-contained.
     * <p>
     * When {@code false}, Maven-resolvable bundles are referenced by their {@code mvn:} URL
     * (smaller archive but requires Maven access on the target system); only bundles that
     * have no Maven coordinates are embedded.
     */
    private final boolean embedAll;

    public ExportOptions(Set<String> types, boolean embedAll) {
        if (types == null || types.isEmpty()) {
            this.types = ALLOWED_TYPES;
        } else {
            Set<String> filtered = new HashSet<>(types);
            filtered.retainAll(ALLOWED_TYPES);
            this.types = filtered.isEmpty() ? ALLOWED_TYPES : Collections.unmodifiableSet(filtered);
        }
        this.embedAll = embedAll;
    }

    /** Convenience constructor — embedAll defaults to {@code true}. */
    public ExportOptions(Set<String> types) {
        this(types, true);
    }

    public Set<String> getTypes() {
        return types;
    }

    public boolean isEmbedAll() {
        return embedAll;
    }

    /**
     * Build an {@link ExportOptions} from HTTP query parameters.
     *
     * @param typeParam  comma-separated Jahia-Module-Type values; {@code null} → all allowed types
     * @param embedAll   whether to embed all JARs ({@code true}) or use Maven URLs ({@code false})
     */
    public static ExportOptions fromParams(String typeParam, boolean embedAll) {
        Set<String> parsed = null;
        if (typeParam != null && !typeParam.trim().isEmpty()) {
            parsed = new HashSet<>(Arrays.asList(typeParam.split(",")));
        }
        return new ExportOptions(parsed, embedAll);
    }
}
