package org.jahia.support.modulemanagement.utils;

import org.apache.maven.repository.internal.MavenRepositorySystemUtils;
import org.eclipse.aether.DefaultRepositorySystemSession;
import org.eclipse.aether.RepositorySystem;
import org.eclipse.aether.RepositorySystemSession;
import org.eclipse.aether.connector.basic.BasicRepositoryConnectorFactory;
import org.eclipse.aether.impl.DefaultServiceLocator;
import org.eclipse.aether.repository.LocalRepository;
import org.eclipse.aether.repository.RemoteRepository;
import org.eclipse.aether.repository.RepositoryPolicy;
import org.eclipse.aether.spi.connector.RepositoryConnectorFactory;
import org.eclipse.aether.spi.connector.transport.TransporterFactory;
import org.eclipse.aether.supplier.RepositorySystemSupplier;
import org.eclipse.aether.transport.file.FileTransporterFactory;
import org.eclipse.aether.transport.wagon.WagonTransporterFactory;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

public class MavenBootstrap {
    public static Logger logger = LoggerFactory.getLogger(MavenBootstrap.class);

    public static RepositorySystem newRepositorySystem() {
        return new RepositorySystemSupplier().get();
    }

    public static RepositorySystem newManualRepositorySystem() {
        /*
         * Aether's components implement org.eclipse.aether.spi.locator.Service to ease manual wiring and using the
         * prepopulated DefaultServiceLocator, we only need to register the repository connector and transporter
         * factories.
         */
        DefaultServiceLocator locator = MavenRepositorySystemUtils.newServiceLocator();
        locator.addService(RepositoryConnectorFactory.class, BasicRepositoryConnectorFactory.class);
        locator.addService(TransporterFactory.class, WagonTransporterFactory.class);
        locator.addService(TransporterFactory.class, FileTransporterFactory.class);

        locator.setErrorHandler(new DefaultServiceLocator.ErrorHandler() {
            @Override
            public void serviceCreationFailed(Class<?> type, Class<?> impl, Throwable exception) {
                logger.error("Service creation failed for {} with implementation {}", type, impl, exception);
            }
        });

        return locator.getService(RepositorySystem.class);
    }

    public static DefaultRepositorySystemSession newRepositorySystemSession(RepositorySystem system) {
        DefaultRepositorySystemSession session = MavenRepositorySystemUtils.newSession();

        LocalRepository localRepo = new LocalRepository("/home/tomcat/.m2/repository");
        session.setLocalRepositoryManager(system.newLocalRepositoryManager(session, localRepo));
        session.setTransferListener(new ConsoleTransferListener());
        session.setRepositoryListener(new ConsoleRepositoryListener());
        session.setOffline(false);

        // uncomment to generate dirty trees
        // session.setDependencyGraphTransformer( null );

        return session;
    }

    public static List<RemoteRepository> newRepositories(RepositorySystem system, RepositorySystemSession session, List<String> repositories) {
        List<RemoteRepository> remoteRepositories = new ArrayList<>();
        for (String repository : repositories) {
            String segments[] = repository.split("@");
            String name = "";
            boolean snapshotEnabled = false;
            for(int i = 0; i < segments.length; i++ )
            {
                String segment = segments[i].trim();
                if( segment.equalsIgnoreCase( "snapshots" ) )
                {
                    snapshotEnabled = true;
                }
                else if( segment.startsWith(  "id=" ) )
                {
                    try {
                        name = segments[ i ].split( "=" )[1].trim();
                    } catch (Exception e) {
                        logger.warn( "Problem with segment {} in {}",segments[i], repository );
                    }
                }
            }
            RemoteRepository.Builder aDefault = new RemoteRepository.Builder(name, "default", segments[0]);
            if(snapshotEnabled)
            {
                aDefault.setSnapshotPolicy(new RepositoryPolicy(true, RepositoryPolicy.UPDATE_POLICY_ALWAYS, RepositoryPolicy.CHECKSUM_POLICY_WARN));
            }
            aDefault.setReleasePolicy(new RepositoryPolicy(true, RepositoryPolicy.UPDATE_POLICY_ALWAYS, RepositoryPolicy.CHECKSUM_POLICY_WARN));
            remoteRepositories.add(0, aDefault.build());
        }
        return remoteRepositories;
    }

    private static RemoteRepository newCentralRepository() {
        return new RemoteRepository.Builder("central", "default", "https://repo.maven.apache.org/maven2/").build();
    }
}
