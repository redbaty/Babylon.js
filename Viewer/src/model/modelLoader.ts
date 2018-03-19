import { AbstractViewer } from "..";
import { ISceneLoaderPlugin, ISceneLoaderPluginAsync, Tools, SceneLoader, Tags, GLTFFileLoader } from "babylonjs";
import { IModelConfiguration } from "../configuration/configuration";
import { ViewerModel, ModelState } from "./viewerModel";

/**
 * An instance of the class is in charge of loading the model correctly.
 * This class will continously be expended with tasks required from the specific loaders Babylon has.
 * 
 * A Model loader is unique per (Abstract)Viewer. It is being generated by the viewer
 */
export class ModelLoader {

    private _loadId: number;
    private _disposed = false;

    private _loaders: Array<ISceneLoaderPlugin | ISceneLoaderPluginAsync>;

    /**
     * Create a new Model loader
     * @param _viewer the viewer using this model loader
     */
    constructor(private _viewer: AbstractViewer) {
        this._loaders = [];
        this._loadId = 0;
    }

    /**
     * Load a model using predefined configuration
     * @param modelConfiguration the modelConfiguration to use to load the model
     */
    public load(modelConfiguration: IModelConfiguration): ViewerModel {

        const model = new ViewerModel(this._viewer, modelConfiguration);

        if (!modelConfiguration.url) {
            model.state = ModelState.ERROR;
            Tools.Error("No URL provided");
            return model;
        }

        let filename = Tools.GetFilename(modelConfiguration.url) || modelConfiguration.url;
        let base = modelConfiguration.root || Tools.GetFolderPath(modelConfiguration.url);
        let plugin = modelConfiguration.loader;

        model.loader = SceneLoader.ImportMesh(undefined, base, filename, this._viewer.scene, (meshes, particleSystems, skeletons) => {
            meshes.forEach(mesh => {
                Tags.AddTagsTo(mesh, "viewerMesh");
            });
            model.meshes = meshes;
            model.particleSystems = particleSystems;
            model.skeletons = skeletons;

            model.initAnimations();
            model.onLoadedObservable.notifyObserversWithPromise(model);
        }, (progressEvent) => {
            model.onLoadProgressObservable.notifyObserversWithPromise(progressEvent);
        }, (e, m, exception) => {
            model.state = ModelState.ERROR;
            Tools.Error("Load Error: There was an error loading the model. " + m);
            model.onLoadErrorObservable.notifyObserversWithPromise({ message: m, exception: exception });
        }, plugin)!;

        if (model.loader.name === "gltf") {
            let gltfLoader = (<GLTFFileLoader>model.loader);
            gltfLoader.animationStartMode = 0;
            gltfLoader.onAnimationGroupLoaded = ag => {
                model.addAnimationGroup(ag);
            }
        }

        model.loadId = this._loadId++;
        this._loaders.push(model.loader);

        return model;
    }

    public cancelLoad(model: ViewerModel) {
        const loader = model.loader || this._loaders[model.loadId];
        // ATM only available in the GLTF Loader
        if (loader && loader.name === "gltf") {
            let gltfLoader = (<GLTFFileLoader>loader);
            gltfLoader.dispose();
            model.state = ModelState.CANCELED;
        } else {
            Tools.Warn("This type of loader cannot cancel the request");
        }
    }

    /**
     * dispose the model loader.
     * If loaders are registered and are in the middle of loading, they will be disposed and the request(s) will be cancelled.
     */
    public dispose() {
        this._loaders.forEach(loader => {
            if (loader.name === "gltf") {
                (<GLTFFileLoader>loader).dispose();
            }
        });
        this._loaders.length = 0;
        this._disposed = true;
    }
}